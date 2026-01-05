export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-8">
        <h1 className="text-4xl font-extrabold text-white mb-8 text-center">
          🏆 Skor Tablosu
        </h1>
        
        <div className="space-y-3">
          {[
            { rank: 1, name: "DORUKSIGMA", score: 9850, icon: "🥇" },
            { rank: 2, name: "ProGamer", score: 8420, icon: "🥈" },
            { rank: 3, name: "ChessMaster", score: 7630, icon: "🥉" },
            { rank: 4, name: "TacticalKing", score: 6890, icon: "⭐" },
            { rank: 5, name: "SpeedRunner", score: 6120, icon: "⭐" },
          ].map((player) => (
            <div
              key={player.rank}
              className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-2xl p-5 hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">{player.icon}</span>
                <div>
                  <p className="text-xl font-bold text-white">{player.name}</p>
                  <p className="text-sm text-slate-400">#{player.rank}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-indigo-400">
                  {player.score.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">PUAN</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            💡 Oyun oyna ve skorunu yükselt!
          </p>
        </div>
      </div>
    </div>
  );
}
