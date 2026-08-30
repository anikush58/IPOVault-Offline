import React from 'react';
import { AppDialog, type AppDialogProps } from './AppDialog';

export type InfoDialogProps = Omit<AppDialogProps, 'type'>;

export function InfoDialog(props: InfoDialogProps) {
  return <AppDialog {...props} type="info" confirmText={props.confirmText || 'OK'} />;
}
