# Inteligência Artificial

A IA é **opcional** e está **desligada por omissão**. Só corre quando estão reunidas três condições:

1. um fornecedor configurado (`AI_PROVIDER=nvidia` + `NVIDIA_API_KEY`);
2. a definição **Análise por IA** activa (Administração → Definições);
3. a biblioteca com **Permitir análise por IA** activo (Administração → Bibliotecas).

## O que faz

| Funcionalidade | Como | Onde aparece |
|---|---|---|
| Descrição da foto | Modelo de visão (VLM) | Visualizador → Informações → "Gerado por IA"; pesquisa normal |
| Etiquetas | VLM (3–12 etiquetas em português) | Visualizador (marcadas "IA"); pesquisa normal |
| Texto na imagem (OCR) | VLM | Visualizador; pesquisa normal |
| Número de pessoas | VLM | Visualizador |
| Pesquisa por significado | Embeddings multimodais **NV-CLIP** (texto e imagem no mesmo espaço) | Pesquisa → "Pesquisa inteligente (IA)" |
| Reconhecimento de pessoas | Modelo **local** (OpenCV YuNet + SFace) — ver secção abaixo | Página **Pessoas**; visualizador → Informações → Pessoas |

## Fornecedor: NVIDIA (build.nvidia.com)

API compatível com OpenAI em `https://integrate.api.nvidia.com/v1`.

| Papel | Modelo (configurável) |
|---|---|
| Visão, principal | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (rápido, bom em português; por vezes sem capacidade → 503) |
| Visão, reserva (redundância) | `meta/llama-3.2-11b-vision-instruct` (com `guided_json` para forçar JSON) |
| Embeddings | `nvidia/llama-nemotron-embed-vl-1b-v2` (multimodal; `input_type` query/passage). O `nvidia/nvclip` não está disponível em todas as contas |

**Redundância**: para cada foto, os modelos de visão são tentados pela ordem de `NVIDIA_VISION_MODELS`.
Se um falhar (erro, indisponibilidade ou resposta sem JSON válido), passa-se ao seguinte. Os 429 e 5xx
são repetidos com espera, e respeita-se o `Retry-After`.

Para trocar de modelos basta alterar o `.env`, sem mudar código:
```env
NVIDIA_VISION_MODELS=modelo/principal,modelo/reserva
```

### Configuração

1. Em https://build.nvidia.com, entre e carregue em **Get API Key** (a chave começa por `nvapi-`).
2. No `backend/.env`:
   ```env
   AI_PROVIDER=nvidia
   NVIDIA_API_KEY=nvapi-...
   NVIDIA_REQUESTS_PER_MINUTE=30
   ```
3. Active **Análise por IA** em Administração → Definições e **Permitir análise por IA** na biblioteca.
4. Teste com uma foto: `php artisan photos:ai --test`
5. Agende as restantes: `php artisan photos:ai --limit=500`. As fotos novas são analisadas
   automaticamente depois de cada sincronização. É preciso o worker da fila `media`.

## Privacidade e custos

- É enviada **uma miniatura** (até ~1024 px, menos de 170 KB), **nunca o original**, para os servidores da NVIDIA.
  Não active a IA em bibliotecas com fotos sensíveis (ex.: "somente para uso interno") sem aprovação.
- O pedido ao modelo proíbe identificar pessoas pelo nome ou especular sobre características sensíveis.
- Os resultados ficam separados dos metadados originais (`media_analysis`, `media_ai_index`,
  `media_embeddings`, `media_tags.source = ai`) e são sempre marcados como "Gerado por IA".
- A pesquisa por significado só compara fotos que o utilizador já pode ver.
- O plano gratuito da NVIDIA tem limites de pedidos. Cada foto usa cerca de 2 pedidos (visão + embedding).
  O ritmo é controlado por `NVIDIA_REQUESTS_PER_MINUTE`.

## Limites conhecidos

- A pesquisa por significado compara todos os vectores em PHP. Funciona bem até dezenas de milhares
  de fotos; acima disso, recomenda-se uma base vectorial (Qdrant, OpenSearch, pgvector).
- A qualidade das descrições em português depende do modelo escolhido.
- Os IDs dos modelos no catálogo da NVIDIA mudam com o tempo. Se `photos:ai --test` falhar com
  "404"/"model not found", escolha outro modelo com visão em build.nvidia.com e actualize `NVIDIA_VISION_MODELS`.

## Reconhecimento de pessoas (local)

Agrupa fotografias pela mesma pessoa, como no Google Fotos. **Tudo corre no servidor da organização**:
nenhuma imagem nem dado facial é enviado para a NVIDIA ou para outro fornecedor.

| Peça | Detalhe |
|---|---|
| Detecção | YuNet (`ml/models/face_detection_yunet_2023mar.onnx`, licença MIT) |
| Reconhecimento | SFace (`ml/models/face_recognition_sface_2021dec.onnx`, licença Apache 2.0) |
| Execução | `ml/faces.py` (Python + OpenCV), chamado pela fila `media` |
| Imagem analisada | Miniatura de 2048 px (`FACES_SOURCE=xlarge`) ou original temporário (`FACES_SOURCE=original`, apagado logo após a análise) |

Condições: definição **Reconhecimento de pessoas** activa **e** biblioteca com **allow_faces**.

**Privacidade (dados biométricos)**
- Rostos com menos de 40 px (`FACES_MIN_CLUSTER_PX`) **não são guardados**, porque não permitem um agrupamento fiável.
- As pessoas não recebem nomes automaticamente; só editores lhes podem dar nome.
- As pessoas só aparecem a quem pode ver as fotografias onde elas estão.
- **Excluir do reconhecimento** (super admin) apaga os rostos da pessoa e impede que volte a ser agrupada.
  Fica guardado apenas um vector de referência, usado para essa exclusão.
- **Apagar todos os dados faciais** (Administração → Definições) remove tudo.
- Antes de usar em produção, obtenha a aprovação da organização e informe as pessoas fotografadas.

**Instalação no servidor**
```bash
cd backend
python3 -m venv ml/.venv
ml/.venv/bin/pip install -r ml/requirements.txt
# modelos (OpenCV Zoo)
curl -L -o ml/models/face_detection_yunet_2023mar.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
curl -L -o ml/models/face_recognition_sface_2021dec.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
php artisan photos:faces --test     # testa uma fotografia
php artisan photos:faces            # agenda as restantes
```

**Afinação**: `FACES_MATCH_THRESHOLD` (omissão 0.42). Um valor mais alto separa mais, com menos risco de misturar
duas pessoas; um valor mais baixo junta mais. As pessoas separadas por engano juntam-se com **Juntar com outra pessoa**.
