import Image from "next/image";
import npLogo from "../../media/np_logo.png";
import { cn } from "@/lib/utils";

export function NpLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src={npLogo}
      alt="NP"
      width={size}
      height={size}
      priority
      className={cn("rounded-md", className)}
    />
  );
}
