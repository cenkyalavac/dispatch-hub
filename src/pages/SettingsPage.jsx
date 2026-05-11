import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, Sheet, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function SettingsPage() {
  const [setupLoading, setSetupLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleSheetsSetup = async () => {
    setSetupLoading(true);
    try {
      const res = await base44.functions.invoke('sheetsSetupHeader', {});
      if (res.data.success) {
        toast.success('Google Sheets header row created!');
      } else {
        toast.error(res.data.error || 'An error occurred');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleTestAuth = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('symfonieAuth', {});
      const data = res.data;
      setTestResult(data);

      if (data.success) {
        const tasksCount = data.tasks_sample?.value?.length ?? 0;
        toast.success(`Connection OK — WhoAmI: ${data.whoami?.Login || 'unknown'}, Tasks in Order: ${tasksCount > 0 ? tasksCount + '+' : 'none found (good or no tasks pending)'}`);
      } else {
        toast.error(data.error || 'Connection failed');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Connection tests and setup tools</p>
      </div>

      <div className="space-y-4">
        {/* Auth test card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Symfonie API Connection Test
            </CardTitle>
            <CardDescription>
              Acquires an Azure AD token and validates access to the Symfonie V5 API.
              Also runs a live check against <code className="text-xs bg-secondary px-1 rounded">GET /Tasks?$filter=State eq 'Order'</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleTestAuth} disabled={testLoading} variant="outline" className="gap-2">
              {testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {testLoading ? 'Testing...' : 'Test Connection'}
            </Button>

            {testResult && (
              <div className="space-y-3">
                {/* Status grid */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                    {testResult.success
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <div>
                      <p className="text-xs text-muted-foreground">Token</p>
                      <p className="font-medium text-xs">{testResult.success ? `OK (expires in ${testResult.token_expires_in}s)` : 'FAILED'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                    {testResult.whoami_status === 200
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                    <div>
                      <p className="text-xs text-muted-foreground">WhoAmI</p>
                      <p className="font-medium text-xs">{testResult.whoami_status === 200 ? (testResult.whoami?.Login || testResult.whoami?.Email || 'OK') : `HTTP ${testResult.whoami_status}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                    {testResult.tasks_api_status === 200
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <div>
                      <p className="text-xs text-muted-foreground">Tasks API (Order state)</p>
                      <p className="font-medium text-xs">
                        {testResult.tasks_api_status === 200
                          ? `HTTP 200 — ${testResult.tasks_sample?.value?.length ?? 0} task(s) found`
                          : `HTTP ${testResult.tasks_api_status}`}
                      </p>
                    </div>
                  </div>
                  {testResult.tasks_sample?.value?.[0] && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Sample Task</p>
                        <p className="font-medium text-xs truncate max-w-[140px]">{testResult.tasks_sample.value[0].Name}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Raw response toggle */}
                <button
                  onClick={() => setShowRaw(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showRaw ? 'Hide' : 'Show'} raw response
                </button>
                {showRaw && (
                  <pre className="bg-secondary p-3 rounded-lg text-xs overflow-auto max-h-64">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sheets setup card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sheet className="w-4 h-4" />
              Google Sheets Setup
            </CardTitle>
            <CardDescription>
              Writes the header row to the target spreadsheet. Run once on first setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSheetsSetup} disabled={setupLoading} variant="outline" className="gap-2">
              {setupLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
              {setupLoading ? 'Creating...' : 'Create Header Row'}
            </Button>
          </CardContent>
        </Card>

        {/* Secrets reference */}
        <Card className="bg-secondary/50 border-dashed">
          <CardContent className="p-6">
            <h3 className="font-medium text-sm mb-3">Required Secrets</h3>
            <div className="space-y-2 text-xs text-muted-foreground font-mono">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-400 inline-block flex-shrink-0" />
                <span>SYMFONIE_CLIENT_ID</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-400 inline-block flex-shrink-0" />
                <span>SYMFONIE_CLIENT_SECRET</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-400 inline-block flex-shrink-0" />
                <span>GOOGLE_SHEETS_SPREADSHEET_ID (optional, for Sheets sync)</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Set via Dashboard → Code → Secrets</p>
          </CardContent>
        </Card>

        {/* API notes */}
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="p-6">
            <h3 className="font-medium text-sm mb-3">Symfonie V5 API Notes</h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>• Task states: <Badge variant="outline" className="text-xs ml-1">Order (3)</Badge> = awaiting acceptance</p>
              <p>• Accept command: <code className="bg-secondary px-1 rounded">taskCommand: "Accept"</code></p>
              <p>• Reject command: <code className="bg-secondary px-1 rounded">taskCommand: "Reject"</code></p>
              <p>• Endpoint: <code className="bg-secondary px-1 rounded">POST /Tasks(id)/Default.ExecuteTaskCommand</code></p>
              <p>• Price from: <code className="bg-secondary px-1 rounded">FinanceRows[].MaxUsd</code> (expanded)</p>
              <p>• Word count from: <code className="bg-secondary px-1 rounded">FinanceRows[BillingUnit=Words].Quantity</code></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}