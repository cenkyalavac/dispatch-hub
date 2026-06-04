import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// State-driven confirm dialog. Replaces window.confirm() — mobile-friendly,
// keyboard-accessible, design-system consistent. Consumer holds a single
// `confirmState` object and passes it here; `null` closes the dialog.
//
// Usage:
//   const [confirm, setConfirm] = useState(null);
//   const ask = () => setConfirm({
//     title: 'Delete X?',
//     body: 'This cannot be undone.',
//     confirmLabel: 'Delete',
//     danger: true,
//     onConfirm: async () => { ... },
//   });
//   <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
//
// onConfirm may be async; the dialog closes after it resolves so callers can
// show loading state inline if needed. Errors should be handled by the caller
// (typically a toast) — this component just runs and closes.
export default function ConfirmDialog({ state, onClose }) {
  const handleConfirm = async () => {
    try {
      await state?.onConfirm?.();
    } finally {
      onClose();
    }
  };

  return (
    <AlertDialog open={!!state} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          {state?.body && (
            <AlertDialogDescription>{state.body}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{state?.cancelLabel || 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={state?.danger ? 'bg-danger hover:bg-danger/90 text-white' : ''}
          >
            {state?.confirmLabel || 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}