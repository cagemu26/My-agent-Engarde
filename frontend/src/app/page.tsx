import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-500/5 rounded-full blur-[150px]"></div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 section-grid opacity-50"></div>

        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 border border-red-200 rounded-lg rotate-12 opacity-20 animate-float"></div>
        <div className="absolute top-40 right-20 w-16 h-16 border border-amber-200 rounded-full opacity-20 animate-float" style={{ animationDelay: "1s" }}></div>
        <div className="absolute bottom-40 left-1/3 w-12 h-12 bg-gradient-to-br from-red-500/10 to-amber-500/10 rounded-lg rotate-45 opacity-30 animate-float" style={{ animationDelay: "2s" }}></div>
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
            <Link href="/training" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Training
            </Link>
            <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              History
            </Link>
            <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Demo
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/analyze"
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300"
            >
              Get Started
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-20 relative">
        <div className="max-w-7xl mx-auto px-6">
          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto mb-20">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-50 to-amber-50 border border-red-100 mb-8 hover-lift cursor-pointer">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-sm font-medium text-red-700">AI-Powered Fencing Analysis</span>
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Master Your
              <span className="block gradient-text">Fencing Game</span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Upload your fencing videos and get instant AI-powered analysis of your technique,
              strategy, and performance improvements with detailed pose detection.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link
                href="/analyze"
                className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold text-lg hover:shadow-2xl hover:shadow-red-500/30 hover-lift transition-all duration-300 flex items-center gap-3"
              >
                <span>Start Analysis</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/demo"
                className="group px-8 py-4 rounded-2xl border-2 border-red-200 hover:border-red-400 text-red-600 font-semibold text-lg hover-lift transition-all duration-300 flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Watch Demo</span>
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 md:gap-16">
              <div className="text-center">
                <div className="text-4xl font-bold gradient-text">10K+</div>
                <div className="text-sm text-muted-foreground mt-1">Videos Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold gradient-text">500+</div>
                <div className="text-sm text-muted-foreground mt-1">Active Athletes</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold gradient-text">99%</div>
                <div className="text-sm text-muted-foreground mt-1">Accuracy Rate</div>
              </div>
            </div>
          </div>

          {/* Feature Cards - Glassmorphism */}
          <div className="grid md:grid-cols-3 gap-6 mb-24">
            {/* Card 1: Video Analysis */}
            <div className="group glass-card p-8 rounded-3xl hover-lift cursor-pointer transition-all duration-300">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-6 shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Video Analysis</h3>
              <p className="text-muted-foreground leading-relaxed">
                Upload your bout or training footage and receive detailed AI analysis of your movements with skeleton overlay.
              </p>
              <div className="mt-6 flex items-center gap-2 text-red-600 font-medium text-sm group-hover:gap-3 transition-all">
                Learn more
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Card 2: Technique Insights */}
            <div className="group glass-card p-8 rounded-3xl hover-lift cursor-pointer transition-all duration-300">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Technique Insights</h3>
              <p className="text-muted-foreground leading-relaxed">
                Get precise feedback on your footwork, blade work, and tactical decisions with AI-generated reports.
              </p>
              <div className="mt-6 flex items-center gap-2 text-amber-600 font-medium text-sm group-hover:gap-3 transition-all">
                Learn more
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Card 3: Training Plans */}
            <div className="group glass-card p-8 rounded-3xl hover-lift cursor-pointer transition-all duration-300">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center mb-6 shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Training Plans</h3>
              <p className="text-muted-foreground leading-relaxed">
                Receive personalized training recommendations based on your performance data and analysis history.
              </p>
              <div className="mt-6 flex items-center gap-2 text-red-600 font-medium text-sm group-hover:gap-3 transition-all">
                Learn more
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>

          {/* How It Works Section */}
          <div className="mb-24">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Get started in three simple steps
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-red-500/30 z-10">
                  1
                </div>
                <div className="glass-card p-8 rounded-3xl pt-12">
                  <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">Upload Video</h3>
                  <p className="text-muted-foreground text-sm">
                    Upload your fencing training or bout video in MP4, MOV, or AVI format.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-amber-500/30 z-10">
                  2
                </div>
                <div className="glass-card p-8 rounded-3xl pt-12">
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">AI Analysis</h3>
                  <p className="text-muted-foreground text-sm">
                    Our AI processes your video and extracts pose data with skeleton overlay.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-red-500/30 z-10">
                  3
                </div>
                <div className="glass-card p-8 rounded-3xl pt-12">
                  <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">Get Insights</h3>
                  <p className="text-muted-foreground text-sm">
                    Receive detailed reports and personalized training recommendations.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="relative mb-24">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-700 rounded-3xl opacity-95"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-amber-500 opacity-0 hover:opacity-10 transition-opacity duration-500 rounded-3xl"></div>

            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-400/20 rounded-full blur-3xl"></div>

            <div className="relative px-8 py-16 md:py-20 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Elevate Your Game?
              </h2>
              <p className="text-red-100 max-w-xl mx-auto mb-8 text-lg">
                Join fencers worldwide using Engarde AI to improve their technique and strategy.
              </p>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-white text-red-600 font-semibold text-lg hover-lift transition-all duration-300 shadow-xl"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Weapon Types Section */}
          <div className="mb-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">Supported Weapon Types</h2>
              <p className="text-muted-foreground">Analysis for all three fencing weapons</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Foil */}
              <div className="group relative overflow-hidden rounded-3xl p-8 border-2 border-transparent hover:border-orange-500/50 transition-all duration-300 hover-lift">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10"></div>
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">🏹</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Foil</h3>
                  <p className="text-muted-foreground text-sm">
                    Technical precision and strategic attacks. Perfect for analyzing point control and targeting.
                  </p>
                </div>
              </div>

              {/* Epee */}
              <div className="group relative overflow-hidden rounded-3xl p-8 border-2 border-transparent hover:border-red-500/50 transition-all duration-300 hover-lift">
                <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10"></div>
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">⚔️</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Épée</h3>
                  <p className="text-muted-foreground text-sm">
                    Full-target combat with emphasis on timing and distance. Analyze your tactical decisions.
                  </p>
                </div>
              </div>

              {/* Sabre */}
              <div className="group relative overflow-hidden rounded-3xl p-8 border-2 border-transparent hover:border-cyan-500/50 transition-all duration-300 hover-lift">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 to-cyan-100/50 dark:from-cyan-950/20 dark:to-cyan-900/10"></div>
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">⚡</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Sabre</h3>
                  <p className="text-muted-foreground text-sm">
                    Lightning-fast attacks and cuts. Analyze speed, precision, and cutting techniques.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center">
                <span className="text-white font-bold">E</span>
              </div>
              <span className="font-semibold text-lg">Engarde AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Engarde AI. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                </svg>
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
