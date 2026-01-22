'use client';
import { useEffect, useState } from 'react';

// Interface dos dados
interface CheckIn {
  id: string;
  weight: number | null;
  feedback: string | null;
  photoFront: string | null;
  photoBack: string | null;
  photoSide: string | null;
  date: string;
  user: {
    name: string;
    email: string;
  };
}

export default function AdminCheckinsPage() {
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Chama a API que criamos anteriormente
    fetch('/api/checkin')
      .then((res) => res.json())
      .then((data) => {
        if(Array.isArray(data)) {
            setCheckins(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-10 text-[#CCFF00] font-bold">Carregando check-ins...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black text-[#CCFF00] italic tracking-tighter">
          CENTRAL DE CHECK-INS
        </h1>
        <button 
            onClick={() => window.location.reload()}
            className="bg-[#222] text-white px-4 py-2 rounded-lg hover:bg-[#333] border border-[#333]"
        >
            Atualizar Lista
        </button>
      </div>

      <div className="grid gap-8">
        {checkins.length === 0 && (
          <p className="text-gray-500 text-lg">Nenhum check-in recebido ainda.</p>
        )}

        {checkins.map((item) => (
          <div 
            key={item.id} 
            className="bg-[#111] border border-[#222] rounded-2xl p-6 shadow-xl"
          >
            {/* Cabeçalho do Card */}
            <div className="flex flex-col md:flex-row justify-between md:items-center border-b border-[#222] pb-4 mb-4 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white uppercase">{item.user?.name || "Aluno Desconhecido"}</h2>
                <p className="text-gray-500 text-sm">{item.user?.email}</p>
              </div>
              <div className="text-right">
                <span className="block text-xs text-gray-400 uppercase tracking-widest font-bold">Data do Envio</span>
                <span className="text-[#CCFF00] font-mono text-lg">
                  {new Date(item.date).toLocaleDateString('pt-BR')} às {new Date(item.date).toLocaleTimeString('pt-BR').slice(0,5)}
                </span>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              
              {/* Dados e Feedback */}
              <div className="lg:w-1/3 flex flex-col gap-4">
                <div className="bg-[#000] p-4 rounded-xl border border-[#333]">
                  <p className="text-gray-400 text-xs font-bold uppercase mb-1">Peso Atual</p>
                  <p className="text-3xl font-black text-[#32ADE6]">{item.weight ? `${item.weight} kg` : '--'}</p>
                </div>

                <div className="bg-[#000] p-4 rounded-xl border border-[#333] flex-1">
                  <p className="text-gray-400 text-xs font-bold uppercase mb-2">Feedback / Notas</p>
                  <p className="text-gray-200 italic leading-relaxed">
                    {item.feedback ? `"${item.feedback}"` : "Sem observações."}
                  </p>
                </div>
              </div>

              {/* Fotos */}
              <div className="lg:w-2/3 grid grid-cols-1 md:grid-cols-3 gap-4">
                {['Front', 'Side', 'Back'].map((pos) => {
                    const url = item[`photo${pos}` as keyof CheckIn] as string;
                    const label = pos === 'Front' ? 'FRENTE' : pos === 'Side' ? 'LADO' : 'COSTAS';
                    
                    if (!url) return null;

                    return (
                        <div key={pos} className="flex flex-col gap-2">
                            <span className="text-xs text-center font-bold text-gray-500">{label}</span>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg border border-[#333]">
                                <img 
                                    src={url} 
                                    alt={label} 
                                    className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-110" 
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white font-bold text-sm bg-black/80 px-3 py-1 rounded-full">AMPLIAR</span>
                                </div>
                            </a>
                        </div>
                    )
                })}
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}