import "./App.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { Toaster } from "./components/ui/toaster";

import StatusPage from "./pages/status-page";

function App() {
	return (
		<>
			<Toaster />

			<Router>
				<Routes>
					<Route path="/" element={<StatusPage />} />
				</Routes>
			</Router>
		</>
	);
}

export default App;
