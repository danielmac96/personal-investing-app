import Link from "next/link";

import { UploadForm } from "./UploadForm";
import { Disclaimer } from "@/components/Disclaimer";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Schwab positions</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4 text-sm text-slate-700">
          <p>
            Paste the contents of your Schwab Positions CSV export below.
            Symbols, quantities, market values, and the cash row are read;
            cost basis is derived from the total when present. Existing rows
            are upserted by symbol — your notes and any saved cost basis are
            preserved if the new CSV omits them.
          </p>
          <UploadForm />
          <p className="text-xs text-slate-500">
            Back to the{" "}
            <Link href="/" className="underline">
              dashboard
            </Link>
            .
          </p>
        </CardBody>
      </Card>

      <Disclaimer />
    </div>
  );
}
