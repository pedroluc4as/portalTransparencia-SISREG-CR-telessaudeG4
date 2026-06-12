import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const formatarNomeMes = (chave) => {
  if (!chave) return '';
  const [mes, ano] = chave.split('/');
  const nomesMeses = {
    '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
    '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
    '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
  };
  return `${nomesMeses[mes]} de ${ano}`;
};

const obterDataOntem = () => {
  const hoje = new Date();
  hoje.setDate(hoje.getDate() - 1);
  
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = hoje.getFullYear();
  
  return `${dia}/${mes}/${ano}`;
};

const renderSkeleton = () => (
  <div className="skeleton-container">
    <div className="grid-resumo">
      {[1, 2].map(i => <div key={`card-${i}`} className="skeleton-card card-resumo"></div>)}
    </div>
    {[1, 2, 3, 4].map((i) => (
      <div key={`bar-${i}`} className="skeleton-card card-falta">
        <div className="skeleton-title w-50"></div>
        <div className="skeleton-line"></div>
      </div>
    ))}
  </div>
);

export default function Faltometro() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [mesSelecionado, setMesSelecionado] = useState('');

  useEffect(() => {
    const buscarFaltometro = async () => {
      try {
        const resposta = await axios.get(`${API_BASE_URL}/faltometro`, { timeout: 10000 });
        
        if (!resposta.data || !resposta.data.historico_meses || Object.keys(resposta.data.historico_meses).length === 0) {
           setErro("O servidor ainda está tentando acessar os dados. Tente atualizar a página em instantes.");
        } else {
           setDados(resposta.data);
           const mesesDisponiveis = Object.keys(resposta.data.historico_meses);
           setMesSelecionado(mesesDisponiveis[mesesDisponiveis.length - 1]);
        }
      } catch (err) {
        setErro(err.message || 'Falha ao buscar os dados do Faltômetro.');
      } finally {
        setCarregando(false);
      }
    };

    buscarFaltometro();
  }, []);

  const dadosDoMes = dados && mesSelecionado ? dados.historico_meses[mesSelecionado] : null;

  return (
    <div className="container-fila-publica">
      
      <header className="busca-header">
        <h2 className="busca-titulo titulo-com-icone">
          Faltômetro Municipal
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="icone-alerta">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </h2>
        <p className="busca-subtitulo">
          <strong className="texto-vermelho">Atenção, munícipe! A sua falta faz falta para quem espera!</strong><br/>
            Os dados abaixo representam pacientes que não compareceram às consultas sem aviso prévio. Cada ausência tira a chance de alguém na fila. Desmarque com antecedência e ajude a melhorar o acesso à saúde de todos!        </p>
      </header>
        
      {carregando && renderSkeleton()}

      {erro && (
        <div className="error-message erro-centralizado">
          <p><strong>ERRO DE CONEXÃO:</strong> {erro}</p>
        </div>
      )}

      {!carregando && !erro && dadosDoMes && (
        <>
          <div className="bloco-unificado-faltometro">
            
            <div className="filtro-linha">
              <select 
                className="select-faltometro"
                value={mesSelecionado} 
                onChange={(e) => setMesSelecionado(e.target.value)}
              >
                {Object.keys(dados.historico_meses).map(mes => (
                  <option key={mes} value={mes}>
                    {formatarNomeMes(mes)}
                  </option>
                ))}
              </select>
            </div>

            <div className="estatisticas-linha">
              <div className="estatistica-item azul">
                <h4 className="estatistica-titulo">Total de Agendamentos</h4>
                <span className="estatistica-numero">{dadosDoMes.resumo.total_avaliado}</span>
              </div>

              <div className="divisor-vertical"></div>

              <div className="estatistica-item vermelho">
                <h4 className="estatistica-titulo">Faltas Confirmadas</h4>
                <span className="estatistica-numero">{dadosDoMes.resumo.ausencias_totais}</span>
              </div>
            </div>

          </div>

          <h3 className="subtitulo-secao">
            Ranking de Faltas - {formatarNomeMes(mesSelecionado)}
          </h3>
          
          <div className="lista-faltas">
            {dadosDoMes.dados_faltas.map((item, index) => (
              <div key={index} className="card-falta">
                
                <div className="falta-header">
                  <strong className="falta-nome">{item.especialidade}</strong>
                  <span className="falta-qtd">
                    {item.faltas} faltas
                  </span>
                </div>

                <div className="barra-fundo">
                  <div 
                    className="barra-progresso" 
                    style={{ width: `${item.taxa_evasao}%` }}
                  ></div>
                </div>

                <div className="falta-detalhe">
                  De um total de {item.agendados} agendamentos ({item.taxa_evasao}% de ausência)
                </div>

              </div>
            ))}
          </div>

          <div className="data-atualizacao">
            Sistema atualizado no dia {obterDataOntem()}
          </div>
        </>
      )}
    </div>
  );
}