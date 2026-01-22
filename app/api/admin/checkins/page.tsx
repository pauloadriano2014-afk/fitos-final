'use client';
import { useEffect, useState } from 'react';

export default function AdminCheckins() {
  const [checkins, setCheckins] = useState([]);

  useEffect(() => {
    // Chama a API sem passar userId, para vir TUDO
    fetch('/api/checkin')
      .then(res => res.json())
      .then(data => setCheckins(data));
  }, []);

  return (
    <div className="p-8 bg-black min-h-screen text-white">
      <h1 className="text-3xl font-bold text-[#CCFF00] mb-6">Últimos Check-ins</h1>
      
      <div className="grid gap-4">
        {checkins.map((item: any) => (
          <div key={item.id} className="bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{item.user?.name || "Aluno Desconhecido"}</h2>
              <p className="text-gray-400 text-sm">{new Date(item.date).toLocaleDateString()} às {new Date(item.date).toLocaleTimeString()}</p>
              
              <div className="mt-2">
                <span className="text-[#CCFF00] font-bold">Peso: {item.weight}kg</span>
              </div>
              
              {item.feedback && (
                <p className="mt-2 bg-gray-800 p-2 rounded text-sm text-gray-300">"{item.feedback}"</p>
              )}
            </div>

            <div className="flex gap-2">
               {/* Se as fotos forem URLs ou Base64, exibe miniaturas ou botões */}
               {item.photoFront && <a href={item.photoFront} target="_blank" className="text-xs bg-blue-600 px-3 py-1 rounded">Frente</a>}
               {item.photoSide && <a href={item.photoSide} target="_blank" className="text-xs bg-blue-600 px-3 py-1 rounded">Lado</a>}
               {item.photoBack && <a href={item.photoBack} target="_blank" className="text-xs bg-blue-600 px-3 py-1 rounded">Costas</a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}