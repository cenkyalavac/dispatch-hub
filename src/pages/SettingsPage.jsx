import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, Sheet, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [setupLoading, setSetupLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

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
      toast.error('Hata: ' + err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleTestAuth = async () => {
    setTestLoading(true);
    try {
      const res = await base44.functions.invoke('symfonieAuth', {});
      if (res.data.access_token) {
        toast.success('Symfonie API connection successful! Token received.');
      } else {
        toast.error(res.data.error || 'Could not retrieve token');
      }
    } catch (err) {
      toast.error('Hata: ' + err.message);
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
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Symfonie API Connection Test
            </CardTitle>
            <CardDescription>Fetches a token from Symfonie using the Client ID and Client Secret.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleTestAuth} disabled={testLoading} variant="outline" className="gap-2">
              {testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {testLoading ? 'Testing...' : 'Test Connection'}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sheet className="w-4 h-4" />
              Google Sheets Kurulumu
            </CardTitle>
            <CardDescription>
              Adds the header row to Google Sheets on first use. Run once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSheetsSetup} disabled={setupLoading} variant="outline" className="gap-2">
              {setupLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
              {setupLoading ? 'Creating...' : 'Create Header Row'}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-secondary/50 border-dashed">
          <CardContent className="p-6">
            <h3 className="font-medium text-sm mb-3">Required Secrets</h3>
            <div className="space-y-2 text-xs text-muted-foreground font-mono">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span>SYMFONIE_CLIENT_ID</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                <span>SYMFONIE_CLIENT_SECRET (dashboard → settings → secrets)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                <span>GOOGLE_SHEETS_SPREADSHEET_ID (dashboard → settings → secrets)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}