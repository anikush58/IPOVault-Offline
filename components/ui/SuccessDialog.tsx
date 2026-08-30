import React from 'react';
import { AppDialog, type AppDialogProps } from './AppDialog';

export type SuccessDialogProps = Omit<AppDialogProps, 'type'>;

export function SuccessDialog(props: SuccessDialogProps) {
  return <AppDialog {...props} type="success" confirmText={props.confirmText || 'OK'} />;
}
