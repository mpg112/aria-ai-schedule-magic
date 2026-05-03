import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import Index from "./pages/Index.tsx";
import Welcome from "./pages/Welcome.tsx";
import Intro from "./pages/Intro.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

/** GitHub Pages / custom base: Vite sets import.meta.env.BASE_URL (trailing slash). */
const routerBasename = (() => {
  const b = import.meta.env.BASE_URL.replace(/\/$/, "");
  return b.length ? b : undefined;
})();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppErrorBoundary>
        <BrowserRouter basename={routerBasename}>
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/intro" element={<Intro />} />
            <Route path="/app" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
