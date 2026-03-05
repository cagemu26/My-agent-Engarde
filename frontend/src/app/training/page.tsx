import Link from "next/link";

export default function Training() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">E</span>
            </div>
            <span className="font-semibold text-lg">Engarde AI</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/analyze" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Analyze
            </Link>
            <Link href="/training" className="text-sm text-primary font-medium">
              Training
            </Link>
            <Link href="/history" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              History
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Your Training Plan</h1>
            <p className="text-muted-foreground">
              Personalized exercises based on your analysis history
            </p>
          </div>

          {/* Weekly Overview */}
          <div className="grid md:grid-cols-7 gap-3 mb-12">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
              <div key={day} className="p-4 rounded-xl bg-card border border-border text-center">
                <p className="text-sm text-muted-foreground mb-2">{day}</p>
                <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center ${i < 3 ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                  {i < 3 ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-medium">{i - 2}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Today's Workout */}
          <div className="mb-12">
            <h2 className="text-xl font-semibold mb-4">Today&apos;s Workout</h2>
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Footwork Drills</h3>
                    <p className="text-sm text-muted-foreground">Advance, retreat, lunge patterns</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                    15 min
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-secondary">
                    <div className="w-3/4 h-full rounded-full bg-primary"></div>
                  </div>
                  <span className="text-sm text-muted-foreground">75%</span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Blade Work Practice</h3>
                    <p className="text-sm text-muted-foreground">Parry-riposte combinations</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                    20 min
                  </span>
                </div>
                <button className="w-full py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-sm font-medium">
                  Start Exercise
                </button>
              </div>
            </div>
          </div>

          {/* Recommended Focus */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Areas to Improve</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Counter-Parry</span>
                  <span className="text-red-500 text-sm">Needs Work</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary">
                  <div className="w-1/3 h-full rounded-full bg-red-500"></div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Distance Control</span>
                  <span className="text-yellow-500 text-sm">Good</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary">
                  <div className="w-2/3 h-full rounded-full bg-yellow-500"></div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Attack Timing</span>
                  <span className="text-green-500 text-sm">Excellent</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary">
                  <div className="w-11/12 h-full rounded-full bg-green-500"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
