import React, { useState, useEffect } from 'react';
import axios from 'axios'; 
import petLogo from '../assets/petlogo.png'; 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function AdminTelessaude() {
    const listaEspecialidadesPadrao = [
        "Cardiologia", "Oftalmologia", "Ortopedia", 
        "Pediatria", "Ginecologia", "Neurologia", 
        "Dermatologia", "Endocrinologia"
    ];

    const [dadosLocais, setDadosLocais] = useState({});
    const [novoLocal, setNovoLocal] = useState('');
    const [mensagem, setMensagem] = useState('');
    const [atualizandoPrincipal, setAtualizandoPrincipal] = useState(false);
    
    // NOVO ESTADO: Controla a tela de carregamento enquanto busca os dados no servidor
    const [carregandoInicial, setCarregandoInicial] = useState(true); 

    const [localSendoEditado, setLocalSendoEditado] = useState(null);
    const [novoNomeInput, setNovoNomeInput] = useState('');

    const cores = {
        laranja: '#E55C24',
        azulClaro: '#4EA6DB',
        azulEscuro: '#0E3D64',
        cinzaFundo: '#F4F7F6',
        branco: '#FFFFFF',
        verdeSucesso: '#2ECC71'
    };

    // ==========================================
    // PARSER e GENERATOR
    // ==========================================
    const lerArquivoConfig = (texto) => {
        const linhas = texto.split('\n');
        const resultado = {};
        let localAtual = null;

        linhas.forEach(linha => {
            const l = linha.trim();
            if (!l || l.startsWith(';') || l.startsWith('#')) return;

            if (l.startsWith('[') && l.endsWith(']')) {
                localAtual = l.substring(1, l.length - 1).trim();
                resultado[localAtual] = {};
                listaEspecialidadesPadrao.forEach(esp => {
                    resultado[localAtual][esp] = false;
                });
            } else if (localAtual && l.includes('=')) {
                const [especialidade, valor] = l.split('=');
                const espNome = especialidade.trim();
                resultado[localAtual][espNome] = valor.trim().toLowerCase() === 'sim';
            }
        });
        return resultado;
    };

    const gerarTextoConfig = (objetoDados) => {
        let textoFinal = "; Arquivo de Configuração - Mapeamento de Telessaúde\n";
        textoFinal += `; Atualizado em: ${new Date().toLocaleDateString('pt-BR')}\n\n`;

        Object.entries(objetoDados).forEach(([local, especialidades]) => {
            textoFinal += `[${local}]\n`;
            Object.entries(especialidades).forEach(([esp, possuiTelessaude]) => {
                textoFinal += `${esp} = ${possuiTelessaude ? 'sim' : 'nao'}\n`;
            });
            textoFinal += '\n';
        });

        return textoFinal;
    };

    // ==========================================
    // NOVO: PUXAR CONFIGURAÇÃO AUTOMATICAMENTE AO ABRIR A PÁGINA
    // ==========================================
    useEffect(() => {
        const puxarDadosDoServidor = async () => {
            try {
                // Tenta buscar a configuração atual no servidor do outro integrante
                const resposta = await axios.get(`${API_BASE_URL}/config-telessaude`);
                
                // Se o servidor devolver o texto do arquivo, ele lê e atualiza a tela
                if (resposta.data && typeof resposta.data === 'string') {
                    const dadosFormatados = lerArquivoConfig(resposta.data);
                    setDadosLocais(dadosFormatados);
                    setMensagem('Configuração atual do servidor carregada com sucesso!');
                    setTimeout(() => setMensagem(''), 4000);
                } 
                // Caso o servidor devolva dentro de um objeto JSON
                else if (resposta.data && resposta.data.configTexto) {
                    const dadosFormatados = lerArquivoConfig(resposta.data.configTexto);
                    setDadosLocais(dadosFormatados);
                }
            } catch (erro) {
                console.log("Nenhuma configuração encontrada no servidor ou erro na conexão.");
                // Não mostra erro na tela para não assustar o usuário, 
                // apenas deixa a tela em branco para ele criar um novo ou subir arquivo.
            } finally {
                setCarregandoInicial(false);
            }
        };

        puxarDadosDoServidor();
    }, []); // O array vazio [] garante que isso só rode 1 vez quando a página abrir

    // ==========================================
    // FUNÇÕES DE AÇÃO DO USUÁRIO
    // ==========================================
    const handleUploadArquivo = (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;

        const leitor = new FileReader();
        leitor.onload = (evento) => {
            try {
                const dadosFormatados = lerArquivoConfig(evento.target.result);
                setDadosLocais(dadosFormatados);
                setMensagem('Ficheiro de configuração carregado com sucesso!');
                setTimeout(() => setMensagem(''), 4000);
            } catch (erro) {
                setMensagem('Erro ao processar o arquivo .config.');
            }
        };
        leitor.readAsText(arquivo);
    };

    const adicionarLocalManualmente = (e) => {
        e.preventDefault();
        if (!novoLocal.trim() || dadosLocais[novoLocal.trim()]) return;

        const mapaInicial = {};
        listaEspecialidadesPadrao.forEach(esp => { mapaInicial[esp] = false; });
        
        setDadosLocais({ ...dadosLocais, [novoLocal.trim()]: mapaInicial });
        setNovoLocal('');
    };

    const alternarTelessaude = (local, especialidade) => {
        const copia = { ...dadosLocais };
        copia[local][especialidade] = !copia[local][especialidade];
        setDadosLocais(copia);
    };

    const removerLocal = (nomeLocal) => {
        const copia = { ...dadosLocais };
        delete copia[nomeLocal];
        setDadosLocais(copia);
    };

    const iniciarEdicao = (nomeAtual) => {
        setLocalSendoEditado(nomeAtual);
        setNovoNomeInput(nomeAtual);
    };

    const salvarNovoNome = (nomeAntigo) => {
        const nomeLimpo = novoNomeInput.trim();
        if (!nomeLimpo || nomeLimpo === nomeAntigo) {
            setLocalSendoEditado(null);
            return;
        }

        if (dadosLocais[nomeLimpo]) {
            alert("Já existe um local com esse novo nome.");
            return;
        }

        const novaCopiaDados = {};
        Object.keys(dadosLocais).forEach(chave => {
            if (chave === nomeAntigo) {
                novaCopiaDados[nomeLimpo] = dadosLocais[nomeAntigo];
            } else {
                novaCopiaDados[chave] = dadosLocais[chave];
            }
        });

        setDadosLocais(novaCopiaDados);
        setLocalSendoEditado(null);
        setMensagem('Nome do local atualizado!');
        setTimeout(() => setMensagem(''), 3000);
    };

    const handleBaixarArquivoAtualizado = () => {
        const blob = new Blob([gerarTextoConfig(dadosLocais)], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'telessaude.config';
        link.click();
        
        setMensagem('Arquivo telessaude.config atualizado e baixado!');
        setTimeout(() => setMensagem(''), 4000);
    };

    const handleAtualizarSitePrincipal = async () => {
        setAtualizandoPrincipal(true);
        setMensagem('Enviando atualizações para o servidor do site principal...');

        try {
            const textoConfig = gerarTextoConfig(dadosLocais);

            await axios.post(`${API_BASE_URL}/atualizar-telessaude`, {
                configTexto: textoConfig,
                configJson: dadosLocais
            });

            setMensagem('✅ Site principal atualizado com sucesso com as novas configurações!');
            setTimeout(() => setMensagem(''), 5000);
        } catch (erro) {
            console.error(erro);
            setMensagem('❌ Erro ao atualizar o site principal. Certifique-se de que o servidor está online.');
        } finally {
            setAtualizandoPrincipal(false);
        }
    };

    return (
        <div style={{ backgroundColor: cores.cinzaFundo, minHeight: '100vh', fontFamily: 'sans-serif', paddingBottom: '60px' }}>
            
            <header style={{ backgroundColor: cores.branco, borderBottom: `4px solid ${cores.azulClaro}`, padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                <img src={petLogo} alt="Logo PET-Saúde" style={{ maxHeight: '90px', width: 'auto' }} />
                <h1 style={{ color: cores.azulEscuro, fontSize: '22px', margin: '10px 0 0 0', fontWeight: 'bold' }}>
                    PAINEL GESTOR - CONFIGURAÇÃO DE TELESSAÚDE
                </h1>
            </header>

            <div style={{ maxWidth: '900px', margin: '30px auto', padding: '0 20px' }}>
                
                <div style={{ backgroundColor: cores.branco, padding: '25px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `6px solid ${cores.laranja}`, marginBottom: '25px' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: cores.azulEscuro }}>1. Carregar Arquivo de Configuração (Manual)</h3>
                    <input type="file" accept=".config,.txt,.ini" onChange={handleUploadArquivo} style={{ display: 'block', padding: '10px', backgroundColor: '#f0f2f5', borderRadius: '4px', width: '100%', boxSizing: 'border-box', cursor: 'pointer' }} />
                </div>

                <div style={{ backgroundColor: cores.branco, padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `6px solid ${cores.azulClaro}`, marginBottom: '25px' }}>
                    <form onSubmit={adicionarLocalManualmente} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <input type="text" value={novoLocal} onChange={e => setNovoLocal(e.target.value)} placeholder="Adicionar novo local manualmente..." style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                        </div>
                        <button type="submit" style={{ backgroundColor: cores.azulEscuro, color: '#fff', border: 'none', padding: '11px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Criar Local</button>
                    </form>
                </div>

                {mensagem && (
                    <div style={{ backgroundColor: '#E8F8F5', color: '#117A65', padding: '12px', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold', marginBottom: '25px', border: '1px solid #A3E4D7' }}>
                        {mensagem}
                    </div>
                )}

                <h2 style={{ color: cores.azulEscuro, fontSize: '18px', marginBottom: '15px' }}>2. Matriz de Atendimento por Localidade</h2>

                {/* Mostra mensagem de carregamento enquanto busca do servidor */}
                {carregandoInicial ? (
                    <div style={{ backgroundColor: cores.branco, padding: '40px', textAlign: 'center', borderRadius: '8px', color: cores.azulClaro, fontWeight: 'bold', border: `1px solid ${cores.azulClaro}` }}>
                        ⏳ Buscando configurações atuais no servidor...
                    </div>
                ) : Object.keys(dadosLocais).length === 0 ? (
                    <div style={{ backgroundColor: cores.branco, padding: '40px', textAlign: 'center', borderRadius: '8px', color: '#999', fontStyle: 'italic', border: '1px dashed #ccc' }}>
                        Nenhum dado encontrado no servidor. Faça o upload de um arquivo ou crie um local para começar.
                    </div>
                ) : (
                    Object.entries(dadosLocais).map(([nomeDoLocal, mapaEspecialidades]) => (
                        <div key={nomeDoLocal} style={{ backgroundColor: cores.branco, borderRadius: '8px', padding: '20px', marginBottom: '25px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderTop: `4px solid ${cores.azulEscuro}` }}>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                                
                                {localSendoEditado === nomeDoLocal ? (
                                    <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '450px' }}>
                                        <input 
                                            type="text" 
                                            value={novoNomeInput} 
                                            onChange={e => setNovoNomeInput(e.target.value)} 
                                            style={{ padding: '6px 10px', borderRadius: '4px', border: `2px solid ${cores.azulClaro}`, flex: 1, fontSize: '15px', fontWeight: 'bold' }}
                                        />
                                        <button onClick={() => salvarNovoNome(nomeDoLocal)} style={{ backgroundColor: cores.verdeSucesso, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Salvar</button>
                                        <button onClick={() => setLocalSendoEditado(null)} style={{ backgroundColor: '#7F8C8D', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: cores.azulEscuro }}> {nomeDoLocal}</span>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {localSendoEditado !== nomeDoLocal && (
                                        <button 
                                            onClick={() => iniciarEdicao(nomeDoLocal)}
                                            style={{ backgroundColor: 'transparent', color: cores.azulClaro, border: `1px solid ${cores.azulClaro}`, padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                        >
                                            Editar Nome
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => removerLocal(nomeDoLocal)}
                                        style={{ backgroundColor: 'transparent', color: '#E74C3C', border: '1px solid #E74C3C', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                    >
                                        Excluir Local
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                {Object.entries(mapaEspecialidades).map(([especialidade, possuiTelessaude]) => (
                                    <div 
                                        key={especialidade}
                                        onClick={() => alternarTelessaude(nomeDoLocal, especialidade)}
                                        style={{
                                            border: `1px solid ${possuiTelessaude ? cores.verdeSucesso : '#E2E8F0'}`,
                                            backgroundColor: possuiTelessaude ? '#E8F8F5' : '#FAFAFA',
                                            padding: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none'
                                        }}
                                    >
                                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>{especialidade}</span>
                                        <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px', backgroundColor: possuiTelessaude ? cores.verdeSucesso : '#94A3B8', color: '#fff' }}>
                                            {possuiTelessaude ? 'Sim' : 'Não'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}

                {Object.keys(dadosLocais).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
                        
                        <button 
                            onClick={handleBaixarArquivoAtualizado}
                            style={{ backgroundColor: '#7F8C8D', color: cores.branco, border: 'none', padding: '15px', width: '100%', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
                        >
                             Baixar Arquivo telessaude.config (Cópia de Segurança)
                        </button>

                        <button 
                            onClick={handleAtualizarSitePrincipal}
                            disabled={atualizandoPrincipal}
                            style={{ 
                                backgroundColor: cores.laranja, 
                                color: cores.branco, 
                                border: 'none', 
                                padding: '18px', 
                                width: '100%', 
                                borderRadius: '6px', 
                                fontSize: '16px', 
                                fontWeight: 'bold', 
                                cursor: atualizandoPrincipal ? 'not-allowed' : 'pointer', 
                                boxShadow: '0 4px 10px rgba(229, 92, 36, 0.3)',
                                opacity: atualizandoPrincipal ? 0.7 : 1
                            }}
                        >
                            {atualizandoPrincipal ? ' Sincronizando com o Servidor...' : 'PUBLICAR ALTERAÇÕES: Atualizar Site Principal Diretamente'}
                        </button>

                    </div>
                )}

            </div>
        </div>
    );
}