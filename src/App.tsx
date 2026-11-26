import { useCallback, useMemo, useState } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './features/dashboard';
import { DiagnosisPage } from './features/diagnosis';
import { GuidePage } from './features/guide';
import { HistoryPage } from './features/history';
import { ReportPage } from './features/report';
import {
  clearSampleIncidentsFromStorage,
  createIncidentRecord,
  deleteIncidentRecord,
  loadIncidents,
  loadSampleIncidentsIntoStorage,
  updateIncidentRecord,
} from './storage';
import type {
  CommandId,
  IncidentCreateInput,
  IncidentRecord,
  IncidentUpdateInput,
  NavRoute,
} from './types';

export default function App() {
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const [incidents, setIncidents] = useState<IncidentRecord[]>(() => loadIncidents());
  const [selectedCommandId, setSelectedCommandId] = useState<CommandId | undefined>(
    undefined
  );
  const [selectedReportIncidentId, setSelectedReportIncidentId] = useState<
    string | undefined
  >(undefined);

  const unresolvedCount = useMemo(
    () => incidents.filter((item) => item.status !== 'resolved').length,
    [incidents]
  );

  const handleNavigate = useCallback((route: NavRoute) => {
    setActiveRoute(route);
  }, []);

  const handleOpenCommandGuide = useCallback((commandId: CommandId) => {
    setSelectedCommandId(commandId);
    setActiveRoute('guide');
  }, []);

  const handleOpenReport = useCallback((incidentId: string) => {
    setSelectedReportIncidentId(incidentId);
    setActiveRoute('report');
  }, []);

  const handleCreateIncident = useCallback(
    (input: IncidentCreateInput): IncidentRecord | null => {
      const created = createIncidentRecord(input);
      if (created) {
        setIncidents(loadIncidents());
      }
      return created;
    },
    []
  );

  const handleUpdateIncident = useCallback(
    (id: string, patch: IncidentUpdateInput): IncidentRecord | null => {
      const updated = updateIncidentRecord(id, patch);
      if (updated) {
        setIncidents(loadIncidents());
      }
      return updated;
    },
    []
  );

  const handleDeleteIncident = useCallback((id: string): boolean => {
    const deleted = deleteIncidentRecord(id);
    if (deleted) {
      setIncidents(loadIncidents());
      setSelectedReportIncidentId((prev) => (prev === id ? undefined : prev));
    }
    return deleted;
  }, []);

  const handleLoadSampleData = useCallback(() => {
    const next = loadSampleIncidentsIntoStorage();
    setIncidents(next);
  }, []);

  const handleClearSampleData = useCallback(() => {
    const next = clearSampleIncidentsFromStorage();
    setIncidents(next);
  }, []);

  return (
    <AppLayout
      activeRoute={activeRoute}
      onNavigate={handleNavigate}
      unresolvedCount={unresolvedCount}
    >
      {activeRoute === 'dashboard' && (
        <DashboardPage
          incidents={incidents}
          onStartDiagnosis={() => setActiveRoute('diagnosis')}
          onOpenHistory={() => setActiveRoute('history')}
          onOpenReport={handleOpenReport}
          onLoadSampleData={handleLoadSampleData}
          onClearSampleData={handleClearSampleData}
        />
      )}

      {activeRoute === 'diagnosis' && (
        <DiagnosisPage
          onSaveIncident={handleCreateIncident}
          onOpenCommandGuide={handleOpenCommandGuide}
          onOpenHistory={() => setActiveRoute('history')}
          onOpenReport={handleOpenReport}
        />
      )}

      {activeRoute === 'guide' && (
        <GuidePage initialCommandId={selectedCommandId} />
      )}

      {activeRoute === 'history' && (
        <HistoryPage
          incidents={incidents}
          onCreateIncident={handleCreateIncident}
          onUpdateIncident={handleUpdateIncident}
          onDeleteIncident={handleDeleteIncident}
          onOpenReport={handleOpenReport}
          onStartDiagnosis={() => setActiveRoute('diagnosis')}
        />
      )}

      {activeRoute === 'report' && (
        <ReportPage
          incidents={incidents}
          initialIncidentId={selectedReportIncidentId}
          onOpenHistory={() => setActiveRoute('history')}
        />
      )}
    </AppLayout>
  );
}
