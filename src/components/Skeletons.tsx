import { STAGES } from "@/lib/types";
import { HomeHero } from "./HomeHero";
import { PAGE_HEADS, PageHead } from "./PageHead";
import { PageTransition } from "./PageTransition";

// Loading states shown the moment a link is followed, laid out like the page that is on its way:
// known headings render as text, everything that depends on data is a placeholder bar.

type W = string | number;

function Bone({ w = "100%", h, className = "" }: { w?: W; h?: W; className?: string }) {
  return <span className={`bone ${className}`} style={{ width: w, height: h }} aria-hidden />;
}

/** Placeholder lines that inherit the font size and line height of their container. */
function Lines({ widths }: { widths: W[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <Bone key={i} w={w} className="bone-line" />
      ))}
    </>
  );
}

function Shell({ children, label = "Loading", classic = false }: { children: React.ReactNode; label?: string; classic?: boolean }) {
  return (
    <PageTransition>
      <div className={`wrap skeleton${classic ? " classic" : ""}`} aria-busy="true">
        <p className="visually-hidden" role="status">
          {label}…
        </p>
        {children}
      </div>
    </PageTransition>
  );
}

function FormSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <section className="form-section">
      <header>
        <h2>
          <Bone w="55%" className="bone-line" />
        </h2>
        <p>
          <Lines widths={["92%", "80%", "60%"]} />
        </p>
      </header>
      <div className="fields">
        {Array.from({ length: rows }, (_, i) => (
          <div className="field" key={i}>
            <Bone w={120} h={11} />
            <Bone h={44} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The front page: its introduction is fixed, so only the buttons wait for the account. */
export function HomeSkeleton() {
  return (
    <Shell classic>
      <HomeHero
        actions={
          <>
            <Bone w={250} h={52} className="sk-pill" />
            <Bone w={230} h={52} className="sk-pill" />
          </>
        }
      />
    </Shell>
  );
}

/** An edition: masthead, top story and the numbered index. */
export function EditionSkeleton() {
  return (
    <Shell label="Loading the edition">
      <header className="masthead">
        <div className="topline">
          <Bone w={240} h={12} />
          <Bone w={150} h={12} />
        </div>
        <h1 className="display">
          <Lines widths={["86%", "58%"]} />
        </h1>
        <div className="grid under">
          <p className="dek">
            <Lines widths={["96%", "90%", "52%"]} />
          </p>
          <div className="facts sk-facts">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} h={14} />
            ))}
          </div>
        </div>
      </header>
      <section className="section-head" style={{ marginTop: 56 }}>
        <span className="label">Top story</span>
      </section>
      <div className="lead">
        <div className="num">
          <Bone w="1.2em" h="0.8em" />
        </div>
        <div className="text">
          <Bone w={180} h={12} />
          <h2 className="title-l">
            <Lines widths={["94%", "66%"]} />
          </h2>
          <p className="dek">
            <Lines widths={["98%", "72%"]} />
          </p>
        </div>
        <div className="side">
          <Bone h={160} />
        </div>
      </div>
      <section className="section-head">
        <span className="label">This week</span>
      </section>
      <ol className="index">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i}>
            <div className="row">
              <span className="n">
                <Bone w={22} h={14} />
              </span>
              <span className="cat">
                <Bone w="70%" h={11} />
              </span>
              <span className="t">
                <span className="title-m">
                  <Lines widths={["92%", i % 2 ? "40%" : "64%"]} />
                </span>
              </span>
              <span className="m">
                <Bone w="60%" h={13} />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

/** One story. */
export function StorySkeleton() {
  return (
    <Shell label="Loading the story">
      <header className="article-head">
        <div className="crumbs">
          <Bone w={260} h={12} />
        </div>
        <h1 className="title-xl">
          <Lines widths={["96%", "74%"]} />
        </h1>
        <div className="byline">
          <Bone w={150} h={14} />
          <Bone w={80} h={14} />
          <Bone w={90} h={14} />
        </div>
      </header>
      {[
        ["Summary", ["98%", "95%", "97%", "60%"], "body"],
        ["Key facts", ["90%", "84%", "70%"], "body"],
      ].map(([label, widths, cls]) => (
        <section className="block" key={label as string}>
          <h2 className="label">{label as string}</h2>
          <div className="content">
            <p className={cls as string}>
              <Lines widths={widths as string[]} />
            </p>
          </div>
        </section>
      ))}
    </Shell>
  );
}

/** The archive: heading, then a list of editions. */
export function ArchiveSkeleton() {
  return (
    <Shell label="Loading the archive">
      <PageHead {...PAGE_HEADS.archive} />
      <ol className="issues">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i}>
            <div className="row">
              <span className="no">
                <Bone w="1.2em" h="0.82em" />
              </span>
              <span className="h">
                <span className="title-m">
                  <Lines widths={[i % 2 ? "76%" : "88%"]} />
                </span>
                <span className="meta" style={{ display: "block", marginTop: 10 }}>
                  <Bone w={220} h={13} />
                </span>
              </span>
              <span className="c">
                <Bone w="70%" h={12} className="sk-right" />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Shell>
  );
}

export function ProfileSkeleton() {
  return (
    <Shell label="Loading your profile">
      <PageHead {...PAGE_HEADS.profile} />
      <FormSectionSkeleton rows={2} />
      <FormSectionSkeleton rows={3} />
      <FormSectionSkeleton rows={2} />
    </Shell>
  );
}

export function AdminSkeleton() {
  return (
    <Shell>
      <PageHead {...PAGE_HEADS.admin} />
      <FormSectionSkeleton rows={2} />
      <FormSectionSkeleton rows={4} />
    </Shell>
  );
}

/** A generation in progress: the eight stages are known in advance. */
export function RunSkeleton() {
  return (
    <Shell label="Loading progress">
      <header className="page-head">
        <Bone w={260} h={12} />
        <h1 className="title-xl">
          <Lines widths={["62%"]} />
        </h1>
        <p className="dek">
          <Lines widths={["40%", "34%"]} />
        </p>
      </header>
      <ol className="stages">
        {STAGES.map((s, i) => (
          <li key={s.key} className="stage pending">
            <span className="sn">{String(i + 1).padStart(2, "0")}</span>
            <span className="sl">{s.label}</span>
            <span className="sd" />
            <span className="ss" />
          </li>
        ))}
      </ol>
    </Shell>
  );
}

/** Sign-in, sign-up and password pages. */
export function AuthSkeleton() {
  return (
    <Shell>
      <div className="split">
        <div className="statement">
          <h1 className="display">
            <Lines widths={["70%", "50%"]} />
          </h1>
          <p className="dek" style={{ marginTop: 26, maxWidth: "34ch" }}>
            <Lines widths={["96%", "88%", "60%"]} />
          </p>
        </div>
        <div className="panel">
          <div className="auth-form">
            <Bone w="40%" h={26} />
            <div className="field">
              <Bone w={70} h={11} />
              <Bone h={46} />
            </div>
            <div className="field">
              <Bone w={90} h={11} />
              <Bone h={46} />
            </div>
            <Bone w={130} h={42} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
