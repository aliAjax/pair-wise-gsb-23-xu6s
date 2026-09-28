import "./styles.css";
import { TurnoverProvider } from "./carrier/store";
import { TurnoverStation } from "./carrier/components/TurnoverStation";

function App() {
  return (
    <TurnoverProvider>
      <TurnoverStation />
    </TurnoverProvider>
  );
}

export default App;
