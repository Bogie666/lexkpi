import { Suspense } from 'react';
import { PhotosClient } from './photos-client';

export const dynamic = 'force-dynamic';

export default function AdminPhotosPage() {
  return (
    <Suspense fallback={null}>
      <PhotosClient />
    </Suspense>
  );
}
