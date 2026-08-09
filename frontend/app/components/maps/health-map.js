import dynamic from "next/dynamic";

const HealthMapClient = dynamic(() => import("./health-map-client"), {
  ssr: false,
  loading: () => (
    <div className="js-mono flex h-[360px] w-full items-center justify-center rounded-[18px] border border-line bg-card text-[10px] tracking-[0.18em] text-muted-2 md:h-[460px]">
      Loading map…
    </div>
  ),
});

export default function HealthMap(props) {
  return <HealthMapClient {...props} />;
}
