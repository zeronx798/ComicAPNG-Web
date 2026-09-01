import { useState } from "react";
import { AppShell, type FeatureId } from "../layouts/AppShell";
import { CreateFeature } from "../features/create/CreateFeature";
import { ExtractFeature } from "../features/extract/ExtractFeature";
import { ReaderFeature } from "../features/reader/ReaderFeature";

export function App() {
  const [active, setActive] = useState<FeatureId>("create");
  return (
    <AppShell active={active} onChange={setActive}>
      <section className="feature-layer" hidden={active !== "create"}>
        <CreateFeature />
      </section>
      <section className="feature-layer" hidden={active !== "extract"}>
        <ExtractFeature />
      </section>
      <section className="feature-layer reader-layer" hidden={active !== "read"}>
        <ReaderFeature />
      </section>
    </AppShell>
  );
}
