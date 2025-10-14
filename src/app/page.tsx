import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/10">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center">
              <Image
                src="https://ext.same-assets.com/1290273661/2938199072.svg"
                alt="Google AI Studio"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Explore documentation
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Case studies
              </Link>
              <Link href="#" className="bg-accent text-accent-foreground px-4 py-2 rounded-md hover:bg-accent/90 transition-colors">
                Get started
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* New Veo 3 Banner */}
      <div className="bg-accent/10 border-b border-accent/20">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-center space-x-2 text-sm">
            <Image
              src="https://ext.same-assets.com/1290273661/1102959114.svg"
              alt="New"
              width={16}
              height={16}
            />
            <span className="text-accent font-medium">New</span>
            <span className="text-foreground">Veo 3</span>
            <span className="text-muted-foreground">Our state-of-the-art video generation model</span>
          </div>
        </div>
      </div>

      <main>
        {/* Hero Section */}
        <section className="py-20">
          <div className="container mx-auto px-6 text-center">
            <div className="flex items-center justify-center mb-8">
              <Image
                src="https://ext.same-assets.com/1290273661/2642814625.svg"
                alt="Google AI Studio"
                width={200}
                height={60}
                className="h-12 w-auto"
              />
            </div>
            <h1 className="text-5xl md:text-7xl font-inter-tight font-bold mb-6">
              DigiBot
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            AI-Powered Chat Agent for Business
            </p>

            {/* Main Feature Image */}
            <div className="relative max-w-5xl mx-auto mb-16">
              <Image
                src="https://ext.same-assets.com/1290273661/815402017.png"
                alt="AI Studio chat landing page"
                width={1200}
                height={700}
                className="w-full h-auto rounded-lg shadow-2xl"
                priority
              />
            </div>

            <Link
              href="#"
              className="inline-block bg-accent text-accent-foreground px-8 py-4 rounded-md text-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Sign up and get started
            </Link>
          </div>
        </section>

        {/* Feature Sections */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              {/* Discover Section */}
              <div>
                <div className="flex items-center mb-4">
                  <Image
                    src="https://ext.same-assets.com/1290273661/501800010.svg"
                    alt="Discover"
                    width={24}
                    height={24}
                    className="mr-3"
                  />
                  <h2 className="text-2xl font-inter-tight font-bold">Discover</h2>
                </div>
                <h3 className="text-xl font-medium mb-4">Explore all of Google's AI models in one place</h3>
                <p className="text-muted-foreground">
                  One easy playground for you to test your prompts with any of our models
                </p>
              </div>
              <div>
                <Image
                  src="https://ext.same-assets.com/1290273661/417806993.png"
                  alt="Explore all of Google's AI models in one place"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Build Section */}
              <div className="md:order-2">
                <h2 className="text-2xl font-inter-tight font-bold mb-4">Build</h2>
                <h3 className="text-xl font-medium mb-4">Go from idea to app with the power of Gemini</h3>
                <p className="text-muted-foreground">
                  Start with a prompt, easily vibe code AI-powered apps, and share with the world
                </p>
              </div>
              <div className="md:order-1">
                <Image
                  src="https://ext.same-assets.com/1290273661/3005335782.png"
                  alt="Go from idea to app with the power of Gemini"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Operate Section */}
              <div>
                <h2 className="text-2xl font-inter-tight font-bold mb-4">Operate</h2>
                <h3 className="text-xl font-medium mb-4">Stay on top of your resource usage</h3>
                <p className="text-muted-foreground">
                  Manage your keys, billing, and projects in one space
                </p>
              </div>
              <div>
                <Image
                  src="https://ext.same-assets.com/1290273661/2586667363.png"
                  alt="Stay on top of your resource usage"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Learn Section */}
              <div className="md:order-2">
                <h2 className="text-2xl font-inter-tight font-bold mb-4">Learn</h2>
                <h3 className="text-xl font-medium mb-4">Build directly with the SDK</h3>
                <p className="text-muted-foreground">
                  Cookbooks, API references, and model capabilities in our docs
                </p>
              </div>
              <div className="md:order-1">
                <Image
                  src="https://ext.same-assets.com/1290273661/699119702.png"
                  alt="Build directly with the SDK"
                  width={500}
                  height={300}
                  className="w-full h-auto rounded-lg"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Developer Quickstart */}
        <section className="py-20 bg-card">
          <div className="container mx-auto px-6">
            <h2 className="text-4xl font-inter-tight font-bold text-center mb-4">
              Start building with the API today
            </h2>

            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-medium mb-2">Developer quickstart</h3>
                  <p className="text-muted-foreground">Set up your environment and make your first API request in minutes</p>
                  <p className="text-sm text-muted-foreground">4 min</p>
                </div>
                <Link href="#" className="bg-accent text-accent-foreground px-6 py-3 rounded-md hover:bg-accent/90 transition-colors">
                  Get API key
                </Link>
              </div>

              {/* Code Example */}
              <div className="bg-background border border-border rounded-lg overflow-hidden">
                <div className="border-b border-border p-4">
                  <div className="flex space-x-4">
                    <button className="text-foreground border-b-2 border-accent pb-1">Python</button>
                    <button className="text-muted-foreground hover:text-foreground">Node.js</button>
                    <button className="text-muted-foreground hover:text-foreground">REST</button>
                  </div>
                </div>
                <div className="p-6">
                  <pre className="font-jetbrains-mono text-sm">
                    <code className="text-green-400">from</code> <code className="text-blue-400">google</code> <code className="text-green-400">import</code> <code className="text-blue-400">genai</code>
                    <br /><br />
                    <code className="text-blue-400">client</code> <code className="text-white">=</code> <code className="text-blue-400">genai</code><code className="text-white">.</code><code className="text-yellow-400">Client</code><code className="text-white">()</code>
                    <br /><br />
                    <code className="text-blue-400">response</code> <code className="text-white">=</code> <code className="text-blue-400">client</code><code className="text-white">.</code><code className="text-blue-400">models</code><code className="text-white">.</code><code className="text-yellow-400">generate_content</code><code className="text-white">(</code>
                    <br />
                    <code className="text-white">    </code><code className="text-blue-400">model</code><code className="text-white">=</code><code className="text-green-400">"gemini-2.5-flash"</code><code className="text-white">,</code>
                    <br />
                    <code className="text-white">    </code><code className="text-blue-400">contents</code><code className="text-white">=</code><code className="text-green-400">"Explain how AI works in a few words"</code>
                    <br />
                    <code className="text-white">)</code>
                    <br />
                    <code className="text-yellow-400">print</code><code className="text-white">(</code><code className="text-blue-400">response</code><code className="text-white">.</code><code className="text-blue-400">text</code><code className="text-white">)</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Explore Models */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <h2 className="text-4xl font-inter-tight font-bold text-center mb-16">
              Explore our models
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Gemini */}
              <Link href="#" className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">Gemini</h3>
                  <Image
                    src="https://ext.same-assets.com/1290273661/1754060029.png"
                    alt="Gemini"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Our state of the art models, excellent at coding, reasoning, creative writing, and multimodal capabilities.
                </p>
              </Link>

              {/* Imagen */}
              <Link href="#" className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">Imagen</h3>
                  <Image
                    src="https://ext.same-assets.com/1290273661/235287193.png"
                    alt="Imagen"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Our best image generation model yet, engineered for creativity. Bring your imagination to life faster than ever before.
                </p>
              </Link>

              {/* Veo */}
              <Link href="#" className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">Veo</h3>
                  <Image
                    src="https://ext.same-assets.com/1290273661/2798294237.png"
                    alt="Veo"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Our latest video generation model, designed to empower filmmakers and storytellers.
                </p>
              </Link>

              {/* Gemini TTS */}
              <Link href="#" className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">Gemini TTS</h3>
                  <Image
                    src="https://ext.same-assets.com/1290273661/3968422623.png"
                    alt="Gemini TTS"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Transform text input into single speaker or multi-speaker audio using native, controllable text-to-speech.
                </p>
              </Link>

              {/* Gemini Native Audio */}
              <Link href="#" className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">Gemini Native Audio</h3>
                  <Image
                    src="https://ext.same-assets.com/1290273661/3822017387.png"
                    alt="Gemini Native Audio"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Hyper realistic audio generation, supporting a wide variety of voices.
                </p>
              </Link>

              {/* Gemma */}
              <Link href="#" className="group bg-card border border-border rounded-lg p-6 hover:border-accent transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-inter-tight font-bold">Gemma</h3>
                  <Image
                    src="https://ext.same-assets.com/1290273661/1754060029.png"
                    alt="Gemma"
                    width={48}
                    height={48}
                    className="w-12 h-12"
                  />
                </div>
                <p className="text-muted-foreground">
                  Lightweight, state-of-the-art open models built from the same technology that powers our Gemini models.
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-20 bg-card">
          <div className="container mx-auto px-6 text-center">
            <div className="flex items-center justify-center mb-6">
              <Image
                src="https://ext.same-assets.com/1290273661/3197733918.svg"
                alt="Google AI Studio"
                width={200}
                height={60}
                className="h-12 w-auto"
              />
            </div>
            <h2 className="text-3xl font-inter-tight font-bold mb-4">
              Start exploring and building with Google's latest AI models
            </h2>
            <Link
              href="#"
              className="inline-block bg-accent text-accent-foreground px-8 py-4 rounded-md text-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Sign up and get started
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/10 py-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-foreground transition-colors">AI Studio</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Gemini App</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Documentation</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Vibecode</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Gemini API Key</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Gemini</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Imagen</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Veo 3</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Gemini 2.5 Flash Image</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
