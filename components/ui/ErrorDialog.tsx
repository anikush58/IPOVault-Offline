import React from 'react';
import { AppDialog, type AppDialogProps } from './AppDialog';

export type ErrorDialogProps = Omit<AppDialogProps, 'type'>;

export function ErrorDialog(props: ErrorDialogProps) {
  return <AppDialog {...props} type="error" isDanger confirmText={props.confirmText || 'OK'} />;
}
