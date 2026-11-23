import React from 'react';
import { Href, Redirect } from 'expo-router';

export default function DonorIndexRedirect() {
  return <Redirect href={'/(vitrin)/hesabim' as Href} />;
}
