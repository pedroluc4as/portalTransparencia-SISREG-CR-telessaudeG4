import json
from pydantic import BaseModel
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from unicodedata import normalize
from datetime import datetime
import os
import httpx
import asyncio
import re
from apscheduler.schedulers.background import BackgroundScheduler
import calendar

load_dotenv()

USUARIO = os.getenv("SISREG_USUARIO")
SENHA = os.getenv("SISREG_SENHA")

CACHE_FILAS = {"dados_fila": [], "ultima_atualizacao": None}
CACHE_FALTOMETRO = {"historico_meses": {}, "ultima_atualizacao": None}

ARQUIVO_CONFIG_TELES = "telessaude_db.json"
CACHE_CONFIG_TELESSAUDE = {"configTexto": "", "configJson": {}}

class ConfigTelessaudeModel(BaseModel):
    configTexto: str
    configJson: Dict[str, Any]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

URL_SOLICITACOES_SISREG = "https://sisreg-es.saude.gov.br/solicitacao-ambulatorial-ms-tres-lagoas"
URL_MARCACOES_SISREG = "https://sisreg-es.saude.gov.br/marcacao-ambulatorial-ms-tres-lagoas"
URL_HOSPITALAR_SISREG = "https://sisreg-es.saude.gov.br/solicitacao-hospitalar-ms-tres-lagoas"

# =========================================================
# ROTAS DO PAINEL ADMIN DE TELESSAÚDE
# =========================================================
def carregar_config_telessaude():
    global CACHE_CONFIG_TELESSAUDE
    if os.path.exists(ARQUIVO_CONFIG_TELES):
        try:
            with open(ARQUIVO_CONFIG_TELES, "r", encoding="utf-8") as f:
                CACHE_CONFIG_TELESSAUDE = json.load(f)
        except Exception as e:
            print(f"[ERRO] Falha ao carregar configuração de telessaude: {e}")

@app.get("/api/config-telessaude")
async def get_config_telessaude():
    return CACHE_CONFIG_TELESSAUDE

@app.post("/api/atualizar-telessaude")
async def atualizar_config_telessaude(payload: ConfigTelessaudeModel):
    global CACHE_CONFIG_TELESSAUDE
    CACHE_CONFIG_TELESSAUDE = {
        "configTexto": payload.configTexto, 
        "configJson": payload.configJson
    }
    try:
        with open(ARQUIVO_CONFIG_TELES, "w", encoding="utf-8") as f:
            json.dump(CACHE_CONFIG_TELESSAUDE, f, ensure_ascii=False, indent=4)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao salvar o arquivo de configuração.")
    return {"mensagem": "Configuração salva e aplicada com sucesso no servidor!"}
# =========================================================

def normalizar_texto(texto: str):
    if not texto: return ""
    return normalize('NFKD', str(texto)).encode('ASCII', 'ignore').decode('ASCII').lower().strip()

def montar_endereco(obj):
    def get_val(chave):
        val = obj.get(chave)
        return str(val).strip() if val and str(val).strip() else ""

    tipo = get_val("tipo_logradouro_paciente_residencia")
    logradouro = get_val("endereco_paciente_residencia")
    rua = " ".join([t for t in [tipo, logradouro] if t])
    if not rua: return None
    numero = get_val("numero_paciente_residencia")
    num_str = f", n° {numero}" if numero else ", s/n"
    bairro = get_val("bairro_paciente_residencia")
    bairro_str = f", {bairro}" if bairro else ""
    comp = get_val("complemento_paciente_residencia")
    comp_str = f", {comp}" if comp else ""
    cidade = get_val("municipio_paciente_residencia")
    uf = get_val("uf_paciente_residencia")
    cidade_uf = f", {cidade} - {uf}" if cidade and uf else (f", {cidade}" if cidade else "")
    cep = re.sub(r'\D', '', get_val("cep_paciente_residencia"))
    cep_str = f"\nCEP: {cep[:5]}-{cep[5:]}" if len(cep) == 8 else (f", CEP: {cep}" if cep else "")
    
    return f"{rua}{num_str}{comp_str}{bairro_str}{cidade_uf}{cep_str}".upper()

@app.get("/api/consulta/{cpf_usuario}")
async def consultar_cpf(cpf_usuario: str, nome_mae: str = Query(None)):

    fase_validacao = bool(nome_mae)

    if not fase_validacao:
        print("="*67, flush=True)
        print(f"|====| NOVA REQUISIÇÃO (FASE 1: BUSCA) - CPF: {cpf_usuario} |====|", flush=True)
        print("="*67, flush=True)
    else:
        print("="*71, flush=True)
        print(f"|====| NOVA REQUISIÇÃO (FASE 2: VALIDAÇÃO) - CPF: {cpf_usuario} |====|", flush=True)
        print("="*71, flush=True)

    try:
        cpf_limpo = cpf_usuario.replace(".", "").replace("-", "").strip()
        
        payload = {
            "query": { "bool": { "must": [ {"term": {"cpf_usuario": cpf_limpo}} ] } },
            "size": 10000
        }
        
        headers = {"Content-Type": "application/json"}
        auth = (USUARIO, SENHA)

        if not fase_validacao:
            print("[API] Iniciando consulta assíncrona dupla ao Governo...", flush=True)

        async def fazer_requisicao(url, nome_busca):
            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                try:
                    resp = await client.post(url + "/_search", json=payload, headers=headers, auth=auth)
                    if resp.status_code == 200:
                        hits = resp.json().get("hits", {}).get("hits", [])
                        if not fase_validacao:
                            print(f"[API] {nome_busca} finalizadas: {len(hits)} encontradas.", flush=True)
                        return hits
                except Exception as e:
                    print(f"[ERRO] Falha ao buscar {nome_busca}: {e}", flush=True)
                return []

        tarefas = [
            fazer_requisicao(URL_SOLICITACOES_SISREG, "Solicitações"),
            fazer_requisicao(URL_MARCACOES_SISREG, "Marcações"),
            fazer_requisicao(URL_HOSPITALAR_SISREG, "Cirurgias")
        ]

        resultados = await asyncio.gather(*tarefas)
        
        lista_solicitacoes = resultados[0]
        lista_marcacoes = resultados[1]
        lista_hospitalar = resultados[2]

        if not lista_solicitacoes and not lista_marcacoes and not lista_hospitalar:
            print("[FIM] Nenhum registro encontrado em nenhuma base.", flush=True)
            return []

        mapa_marcacoes = {}
        for item in lista_marcacoes:
            m_source = item.get("_source", {})
            dt_m = m_source.get("data_solicitacao")
            
            if dt_m:
                chave = dt_m[:10]
                if chave not in mapa_marcacoes:
                    mapa_marcacoes[chave] = []
                mapa_marcacoes[chave].append(m_source)

        dados_finais = []

        if lista_solicitacoes:

            for item in lista_solicitacoes:

                if "_source" not in item:
                    item["_source"] = {}
                source = item["_source"]
                
                dt_s = source.get("data_solicitacao")    
                chave = dt_s[:10] if dt_s else None
                m_dados = {}
                
                if chave and mapa_marcacoes.get(chave):
                    m_dados = mapa_marcacoes[chave].pop(0)
                
                chaves_tels = ["telefone_paciente","telefone"]
                tels_encontrados = []
                for obj in [source, m_dados]:
                    for k in chaves_tels:
                        v = obj.get(k)
                        if v:
                            partes = str(v).replace(";", ",").split(",")
                            for p in partes:
                                p_limpo = re.sub(r'\D', '', str(p))
                                if p_limpo and p_limpo not in tels_encontrados:
                                    tels_encontrados.append(p_limpo)
                
                item["_source"]["telefone_unificado"] = ", ".join(tels_encontrados) or "Não informado"
                item["_source"]["endereco_completo"] = montar_endereco(source) or montar_endereco(m_dados) or "Endereço não informado"

                if chave in mapa_marcacoes:
                    for campo in ["data_marcacao", "nome_unidade_executante", "status_solicitacao", 
                                 "descricao_interna_procedimento", "nome_grupo_procedimento", "telefone_unidade_executante"]:
                        if m_dados.get(campo):
                            item["_source"][campo] = m_dados.get(campo)
                            
            dados_finais.extend(lista_solicitacoes)
            
        for lista_m in mapa_marcacoes.values():
            for m_source in lista_m:
                novo_item = {"_source": m_source}
                tel = m_source.get("telefone_paciente") or m_source.get("telefone") or ""
                novo_item["_source"]["telefone_unificado"] = re.sub(r'\D', '', str(tel)) or "Não informado"
                novo_item["_source"]["endereco_completo"] = montar_endereco(m_source) or "Endereço não informado"
                dados_finais.append(novo_item)

        if lista_hospitalar:

            for item in lista_hospitalar:

                if "_source" not in item:
                    item["_source"] = {}
                source = item["_source"]

                status_bruto = str(source.get("status", "PENDENTE")).upper().strip()
                item["_source"]["status_solicitacao"] = status_bruto
                
                tel = source.get("telefone_paciente") or source.get("telefone") or ""
                item["_source"]["telefone_unificado"] = re.sub(r'\D', '', str(tel)) or "Não informado"
                item["_source"]["endereco_completo"] = montar_endereco(source) or "Endereço não informado"
                
                item["_source"]["tipo_registro"] = "HOSPITALAR"
                
            dados_finais.extend(lista_hospitalar)

        if not dados_finais:
            print("[FIM] Nenhum registro sobrou após o processamento.", flush=True)
            return []
        
        nome_mae_banco = ""
        for item in dados_finais:
            mae = item.get("_source", {}).get("no_mae_usuario", "")
            if mae and str(mae).strip():
                nome_mae_banco = str(mae).strip()
                break

        if not fase_validacao:
            print(f"[API] Total Unificado: {len(dados_finais)}", flush=True)
            print("[SEGURANÇA] Solicitando nome da mãe ao usuário...", flush=True)
            return {
                "status": "aguardando_validacao",
                "mensagem": "Confirmação necessária"
            }

        nome_real_norm = normalizar_texto(nome_mae_banco)
        nome_digitado_norm = normalizar_texto(nome_mae)

        primeiro_nome_real = nome_real_norm.split()[0] if nome_real_norm else ""
        primeiro_nome_digitado = nome_digitado_norm.split()[0] if nome_digitado_norm else ""

        print(f"[VALIDAÇÃO] Comparando: Banco['{primeiro_nome_real}'] vs Digitado['{primeiro_nome_digitado}']", flush=True)

        if not primeiro_nome_real:
             print("[ERRO CRÍTICO] Cadastro no banco sem nome da mãe.", flush=True)
             raise HTTPException(status_code=403, detail="Dados cadastrais incompletos no sistema.")

        if primeiro_nome_real != primeiro_nome_digitado:
            print("[VALIDAÇÃO] Falha: Nomes não conferem.", flush=True)
            raise HTTPException(status_code=403, detail="Nome da mãe incorreto")
        
        ano_atual = datetime.now().year
        ano_limite = ano_atual - 5
        contador_front = 0

        for item in dados_finais:
            source = item.get("_source", {})
           # =========================================================
            # INÍCIO DO FILTRO DE TELESSAÚDE (DINÂMICO)
            # =========================================================
            unidade_exec = normalizar_texto(source.get("nome_unidade_executante", ""))
            proced = normalizar_texto(source.get("descricao_interna_procedimento", ""))
            
            is_tele = False
            config_json = CACHE_CONFIG_TELESSAUDE.get("configJson", {})
            
            # Percorre o objeto JSON vindo do React (Unidade -> Especialidades)
            for unidade_cfg, especialidades in config_json.items():
                unidade_cfg_norm = normalizar_texto(unidade_cfg)
                
                # Se o nome da unidade bater com a configuração
                if unidade_cfg_norm in unidade_exec or unidade_exec in unidade_cfg_norm:
                    
                    # Percorre as especialidades e verifica se estão ativadas (True)
                    for esp_cfg, ativo in especialidades.items():
                        if ativo: 
                            esp_cfg_norm = normalizar_texto(esp_cfg)
                            if esp_cfg_norm in proced:
                                is_tele = True
                                break
                if is_tele:
                    break

            item["_source"]["is_telessaude"] = is_tele
            # =========================================================
            # FIM DO FILTRO DE TELESSAÚDE
            # =========================================================
            data_ref = source.get("data_solicitacao") or source.get("data_marcacao") or source.get("data_atualizacao")
            
            ano_str = str(data_ref)[:4] if data_ref else ""
            
            if not ano_str.isdigit():
                contador_front += 1
            else:
                ano = int(ano_str)
                if ano >= ano_limite:
                    contador_front += 1
                else:
                    status = str(source.get("status_solicitacao", "")).upper()
                    if "PENDENTE" in status or "AGUARDANDO" in status or "ESPERA" in status:
                        contador_front += 1
        
        print(f"[>> VERIFICAÇÃO <<] O Front-end DEVE exibir exatamente: {contador_front} procedimentos.", flush=True)
        print("[SUCESSO!] Acesso liberado. Enviando dados ao Frontend.", flush=True)
        return dados_finais

    except Exception as e:
        print(f"[EXCEÇÃO] Ocorreu um erro: {e}", flush=True)
        if isinstance(e, HTTPException):
            raise e
        return []
 
async def atualizar_cache_filas():
    global CACHE_FILAS
    try:
        print("[CRON] Iniciando atualização diária das filas às 04:00 da manhã...", flush=True)

        payload = {
            "size": 10000, 
            "_source": [
                "descricao_interna_procedimento",
                "procedimentos.descricao_interna",
                "status_solicitacao"
            ],
            "query": {
                "bool": {
                    "must": [
                        { "term": { "codigo_central_reguladora": "500830" } }
                    ],
                    "should": [
                        { "match_phrase": { "status_solicitacao": "SOLICITAÇÃO / PENDENTE / REGULADOR" } },
                        { "match_phrase": { "status_solicitacao": "SOLICITAÇÃO / PENDENTE / FILA DE ESPERA" } },
                        { "match_phrase": { "status_solicitacao": "SOLICITAÇÃO / REENVIADA / REGULADOR" } }
                    ],
                    "minimum_should_match": 1
                }
            }
        }

        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.post(
                f"{URL_SOLICITACOES_SISREG}/_search", 
                json=payload, 
                headers={"Content-Type": "application/json"}, 
                auth=(USUARIO, SENHA)
            )
            dados_json = resp.json()
        
        registros = dados_json.get("hits", {}).get("hits", [])
        
        mapa_procedimentos = {}

        for hit in registros:
            source = hit.get("_source", {})
            
            procedimentos = source.get("procedimentos", [])
            
            if not procedimentos:
                procedimentos = [{"descricao_interna": source.get("descricao_interna_procedimento")}]
                
            for proc in procedimentos:
                nome_original = proc.get("descricao_interna")
                
                if not nome_original:
                    nome_original = source.get("descricao_interna_procedimento")
                    
                if not nome_original:
                    nome_original = "PROCEDIMENTO NÃO INFORMADO"
                    
                nome_limpo = nome_original.strip().upper()
                
                if nome_limpo in mapa_procedimentos:
                    mapa_procedimentos[nome_limpo] += 1
                else:
                    mapa_procedimentos[nome_limpo] = 1

        dados_fila = [{"especialidade": k, "quantidade": v} for k, v in mapa_procedimentos.items()]
        dados_fila.sort(key=lambda x: x["quantidade"], reverse=True)

        CACHE_FILAS["dados_fila"] = dados_fila
        CACHE_FILAS["ultima_atualizacao"] = datetime.now().strftime("%d/%m/%Y às %H:%M")
        print("[CRON] Cache das filas atualizado com sucesso!", flush=True)

    except Exception as e:
        print(f"[CRON ERRO] Falha ao atualizar cache: {e}", flush=True)

@app.get("/api/filas-espera")
async def obter_filas_espera():
    return CACHE_FILAS

async def atualizar_cache_faltometro():
    global CACHE_FALTOMETRO
    try:
        print("[CRON] Iniciando extração dos últimos 6 meses para o Faltômetro...", flush=True)

        hoje = datetime.now()
        dados_por_mes = {}

        for i in range(5, -1, -1): 
            mes_alvo = hoje.month - i
            ano_alvo = hoje.year
            
            if mes_alvo <= 0:
                mes_alvo += 12
                ano_alvo -= 1
                
            primeiro_dia = f"{ano_alvo}-{mes_alvo:02d}-01"
            ultimo_dia_mes = calendar.monthrange(ano_alvo, mes_alvo)[1]
            ultimo_dia = f"{ano_alvo}-{mes_alvo:02d}-{ultimo_dia_mes}"
            
            chave_mes = f"{mes_alvo:02d}/{ano_alvo}"

            dados_por_mes[chave_mes] = {
                "total_agendamentos": 0,
                "total_faltas_geral": 0,
                "especialidades": {}
            }

            payload = {
                "size": 10000, 
                "_source": ["nome_grupo_procedimento", "status_solicitacao"],
                "query": {
                    "bool": {
                        "must": [
                            { "term": { "codigo_central_reguladora": "500830" } },
                            {
                                "range": {
                                    "data_marcacao": {
                                        "gte": f"{primeiro_dia}T00:00:00",
                                        "lte": f"{ultimo_dia}T23:59:59"
                                    }
                                }
                            }
                        ]
                    }
                }
            }

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                resp = await client.post(
                    f"{URL_MARCACOES_SISREG}/_search", 
                    json=payload, 
                    headers={"Content-Type": "application/json"}, 
                    auth=(USUARIO, SENHA)
                )
                dados_json = resp.json()
            
            registros = dados_json.get("hits", {}).get("hits", [])
            
            for hit in registros:
                source = hit.get("_source", {})
                status = str(source.get("status_solicitacao", "")).upper()
                especialidade = str(source.get("nome_grupo_procedimento", "NÃO INFORMADA")).strip().upper()
                
                if "PENDENTE" in status or "CANCELADA" in status or "DEVOLVIDA" in status or especialidade == "NONE":
                    continue

                especialidade = especialidade.replace("GRUPO - ", "").strip()
                mes_ref = dados_por_mes[chave_mes]
                
                mes_ref["total_agendamentos"] += 1
                
                if especialidade not in mes_ref["especialidades"]:
                    mes_ref["especialidades"][especialidade] = {"agendados": 0, "faltas": 0}
                    
                mes_ref["especialidades"][especialidade]["agendados"] += 1

                if "AGENDAMENTO / FALTA / EXECUTANTE" in status:
                    mes_ref["total_faltas_geral"] += 1
                    mes_ref["especialidades"][especialidade]["faltas"] += 1

        cache_final = {}
        for mes, info in dados_por_mes.items():
            lista_especialidades = []
            
            for esp, nums in info["especialidades"].items():
                if nums["faltas"] > 0: 
                    taxa = (nums["faltas"] / nums["agendados"]) * 100
                    lista_especialidades.append({
                        "especialidade": esp,
                        "agendados": nums["agendados"],
                        "faltas": nums["faltas"],
                        "taxa_evasao": round(taxa, 1)
                    })

            lista_especialidades.sort(key=lambda x: x["faltas"], reverse=True)

            if info["total_agendamentos"] > 0:
                cache_final[mes] = {
                    "resumo": {
                        "total_avaliado": info["total_agendamentos"],
                        "ausencias_totais": info["total_faltas_geral"]
                    },
                    "dados_faltas": lista_especialidades
                }

        CACHE_FALTOMETRO["historico_meses"] = cache_final
        CACHE_FALTOMETRO["ultima_atualizacao"] = datetime.now().strftime("%d/%m/%Y às %H:%M")
        
        print(f"[CRON] Faltômetro atualizado! Meses processados: {list(cache_final.keys())}", flush=True)

    except Exception as e:
        print(f"[CRON ERRO] Falha ao processar Faltômetro: {e}", flush=True)

@app.get("/api/faltometro")
async def obter_faltometro():
    return CACHE_FALTOMETRO

@app.on_event("startup")
async def iniciar_agendador():
    #carrega o arquivo json que ficou salvo (se houver queda do servidor ou deploy por parte da prefeitura)
    carregar_config_telessaude()

    scheduler = BackgroundScheduler()
    scheduler.add_job(lambda: asyncio.run(atualizar_cache_filas()), 'cron', hour=4, minute=0)
    scheduler.add_job(lambda: asyncio.run(atualizar_cache_faltometro()), 'cron', hour=4, minute=15)
    scheduler.start()
    
    asyncio.create_task(atualizar_cache_filas())
    asyncio.create_task(atualizar_cache_faltometro())