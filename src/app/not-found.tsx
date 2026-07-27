import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container flex min-h-dvh max-w-2xl flex-col justify-center py-28 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-4 text-balance text-headline font-semibold text-foreground">
        That project isn&apos;t here.
      </h1>
      <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
        The link may be old, or the project may have been unpublished. Everything current is
        one click away.
      </p>
      <div className="mt-8 flex justify-center">
        <Button asChild size="lg">
          <Link href="/#work">
            <ArrowLeft aria-hidden="true" />
            Back to the work
          </Link>
        </Button>
      </div>
    </div>
  );
}
