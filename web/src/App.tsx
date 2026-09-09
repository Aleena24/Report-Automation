import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/toast';
import Today from './pages/Today';
import DataHub from './pages/DataHub';
import CoursePlans from './pages/CoursePlans';
import StudentProfiles from './pages/StudentProfiles';
import Queries from './pages/Queries';
import Faculty from './pages/Faculty';
import Tracker from './pages/Tracker';
import MailLog from './pages/MailLog';
import Settings from './pages/Settings';
import Preview from './pages/Preview';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="data" element={<DataHub />} />
          <Route path="course-plans" element={<CoursePlans />} />
          <Route path="student-profiles" element={<StudentProfiles />} />
          <Route path="queries" element={<Queries />} />
          <Route path="faculty" element={<Faculty />} />
          <Route path="tracker" element={<Tracker />} />
          <Route path="mail-log" element={<MailLog />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports/:key" element={<Preview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
