import Header from "../components/Header";
import Footer from "../components/Footer";
import FAQSection from "../components/FAQSection";
import Hero from "../components/sections/Hero";
import HowItWorks from "../components/sections/HowItWorks";
import WhatIs from "../components/sections/WhatIs";
import PanelCrm from "../components/sections/PanelCrm";
import WhatsAppFeature from "../components/sections/WhatsAppFeature";
import SalesFeature from "../components/sections/SalesFeature";
import Comparison from "../components/sections/Comparison";
import Benefits from "../components/sections/Benefits";
import Pricing from "../components/sections/Pricing";
import CtaBanner from "../components/sections/CtaBanner";
import ContactForm from "../components/sections/ContactForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <WhatIs />
        <PanelCrm />
        <WhatsAppFeature />
        <SalesFeature />
        <Comparison />
        <Benefits />
        <Pricing />
        <ContactForm />
        <FAQSection />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
