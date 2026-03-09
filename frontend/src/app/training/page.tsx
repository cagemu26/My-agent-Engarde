import Link from "next/link";

export default function Training() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[80px]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform duration-300">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">Engarde</span>
              <span className="font-bold text-xl text-red-600">AI</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/analyze" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Analyze
            </Link>
            <Link href="/training" className="text-sm font-medium text-red-600 hover-lift">
              Training
            </Link>
            <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              History
            </Link>
            <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Demo
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Your Training Plan</h1>
            <p className="text-muted-foreground text-lg">
              Personalized exercises based on your analysis history
            </p>
          </div>

          {/* Weekly Overview */}
          <div className="grid grid-cols-7 gap-3 mb-12">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
              <div key={day} className="glass-card p-4 rounded-2xl text-center hover-lift transition-all duration-300">
                <p className="text-sm text-muted-foreground mb-3">{day}</p>
                <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  i < 3
                    ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30'
                    : 'bg-secondary'
                }`}>
                  {i < 3 ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="font-semibold">{i - 2}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Today's Workout */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Today&apos;s Workout</h2>
            <div className="space-y-5">
              {/* Exercise 1 */}
              <div className="group glass-card p-6 rounded-3xl hover-lift transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Footwork Drills</h3>
                      <p className="text-sm text-muted-foreground">Advance, retreat, lunge patterns</p>
                    </div>
                  </div>
                  <span className="px-4 py-1.5 rounded-full bg-red-100 text-red-600 text-sm font-medium">
                    15 min
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-red-500 to-red-600"></div>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">75%</span>
                  </div>
                  <button className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all">
                    Continue Exercise
                  </button>
                </div>
              </div>

              {/* Exercise 2 */}
              <div className="group glass-card p-6 rounded-3xl hover-lift transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Blade Work Practice</h3>
                      <p className="text-sm text-muted-foreground">Parry-riposte combinations</p>
                    </div>
                  </div>
                  <span className="px-4 py-1.5 rounded-full bg-amber-100 text-amber-600 text-sm font-medium">
                    20 min
                  </span>
                </div>
                <button className="w-full py-3 rounded-xl border-2 border-red-200 text-red-600 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Start Exercise
                </button>
              </div>

              {/* Exercise 3 */}
              <div className="group glass-card p-6 rounded-3xl hover-lift transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Conditioning</h3>
                      <p className="text-sm text-muted-foreground">Endurance and flexibility</p>
                    </div>
                  </div>
                  <span className="px-4 py-1.5 rounded-full bg-secondary text-muted-foreground text-sm font-medium">
                    10 min
                  </span>
                </div>
                <button className="w-full py-3 rounded-xl border-2 border-border text-muted-foreground font-medium hover:border-red-300 hover:text-red-600 transition-colors">
                  Start Exercise
                </button>
              </div>
            </div>
          </div>

          {/* Recommended Focus */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Areas to Improve</h2>
            <div className="grid md:grid-cols-3 gap-5">
              <div className="glass-card p-5 rounded-2xl hover-lift transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">Counter-Parry</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Needs Work</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-red-500"></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">33% improvement</p>
              </div>
              <div className="glass-card p-5 rounded-2xl hover-lift transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">Distance Control</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-600">Good</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full w-2/3 rounded-full bg-yellow-500"></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">66% improvement</p>
              </div>
              <div className="glass-card p-5 rounded-2xl hover-lift transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold">Attack Timing</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-600">Excellent</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full w-11/12 rounded-full bg-green-500"></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">92% improvement</p>
              </div>
            </div>
          </div>

          {/* Quick Workouts */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Quick Workouts</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { name: "Warm-up", time: "5 min", icon: "🔥" },
                { name: "Lunges", time: "10 min", icon: "🦵" },
                { name: "Blade Drills", time: "15 min", icon: "⚔️" },
                { name: "Cool Down", time: "5 min", icon: "🧘" },
              ].map((workout) => (
                <button key={workout.name} className="glass-card p-5 rounded-2xl text-left hover-lift transition-all duration-300 group">
                  <div className="text-3xl mb-3">{workout.icon}</div>
                  <h3 className="font-semibold mb-1 group-hover:text-red-600 transition-colors">{workout.name}</h3>
                  <p className="text-sm text-muted-foreground">{workout.time}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
