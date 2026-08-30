import React from 'react';
import { AppDialog, type AppDialogProps } from './AppDialog';

export type ConfirmationDialogProps = Omit<AppDialogProps, 'type'>;

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  return <AppDialog {...props} type="confirm" />;
}
