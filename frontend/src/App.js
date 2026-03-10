import "@/App.css";
import { Toaster } from "sonner";

import { MediTrackApp } from "@/meditrack-app";

function App() {
  return (
    <>
      <MediTrackApp />
      <Toaster richColors position="top-right" />
    </>
  );
}

export default App;
