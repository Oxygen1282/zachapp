import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/login";
import Layout from "./components/Layout";
import MyCalendar from "./pages/calendar";
import Clients from "./pages/clients";
import Jobs from "./pages/jobs";
import Accounting from "./pages/accounting";
import Billing from "./pages/billing";
import Contracts from "./pages/contracts";
import Timesheets from "./pages/timesheets";
import Employees from "./pages/employees";

function AppContent() {
  const { token } = useAuth();

  if (!token) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>

        {/* Parent rout renders Layout (the sidebar). Its children rendered
            into the <outlet /> inside Layout - so the sidebar stays put 
            and only the content area changes. */}
        <Route path="/" element={<Layout />}>

          {/* "index" = the default child shown at "/" -> Calendar is home. */}
          <Route index element={<MyCalendar />} />
          
          <Route path="clients" element={<Clients />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="billing" element={<Billing />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="employees" element={<Employees />} />
        
        </Route>
        
      </Routes>
    </BrowserRouter>
  );
}

// AuthProvider wraps everything so useAuth() works throughout.
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;