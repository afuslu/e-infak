import React from 'react';
import { Href, Redirect } from 'expo-router';

export default function LegacyVitrinRedirect() {
  return <Redirect href={'/(vitrin)' as Href} />;
}
