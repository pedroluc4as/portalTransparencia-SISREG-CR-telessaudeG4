import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const renderSkeleton = () => (
  <div className="grid-especialidades">
    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
      <div key={i} className="skeleton-card" style={{ height: '160px', display: 'flex', flexDirection: 'column' }}>
        <div className="skeleton-title" style={{ width: '80%' }}></div>
        <div className="skeleton-line w-50"></div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
           <div className="skeleton-title" style={{ width: '50px', height: '40px', margin: 0 }}></div>
           <div className="skeleton-line" style={{ width: '80px', margin: 0 }}></div>
        </div>
      </div>
    ))}
  </div>
);

export default function FilaPublica() {
  const [filas, setFilas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const buscarFilas = async () => {
      try {
        const resposta = await axios.get(`${API_BASE_URL}/filas-espera`);
        
        if (resposta.data.dados_fila.length === 0) {
           setErro("A API retornou 0 resultados. Verifique o campo de agregação no Python.");
        } else {
           setFilas(resposta.data.dados_fila);
        }
      } catch (err) {
        setErro(err.message || 'Falha ao buscar os dados da fila.');
      } finally {
        setCarregando(false);
      }
    };

    buscarFilas();
  }, []);

  return (
    <div className="container-fila-publica">
      <header style={{ textAlign: 'center', marginBottom: '30px', animation: 'fadeIn 0.4s ease' }}>
        <h2 style={{ fontSize: '1.8rem', color: 'var(--gov-blue)', textTransform: 'uppercase', marginBottom: '10px', fontFamily: 'AktivGrotesk-XBold, sans-serif' }}>
          Painel de Filas de Espera por Especialidade
        </h2>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-dark)', fontWeight: '600' }}>
          Acompanhe a quantidade de pacientes aguardando na fila de espera de agendamentos por especialidade no município.<br/>
        </p>
      </header>
        
      {carregando && renderSkeleton()}

      {erro && (
        <div className="error-message">
          <p>ERRO: {erro}</p>
        </div>
      )}

      {!carregando && !erro && filas.length > 0 && (
        <div className="grid-especialidades">
          {filas.map((item, index) => (
            <div key={index} className="card-especialidade">
              <h3 className="card-title-especialidade">{item.especialidade}</h3>
              <div className="dado-quantidade">
                <span className="numero-fila">{item.quantidade}</span>
                <span className="legenda-fila">
                  {item.quantidade === 1 ? 'paciente' : 'pacientes'}<br />aguardando
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}