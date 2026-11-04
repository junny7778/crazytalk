import type { ComponentProps, ReactNode } from "react";
import { Button } from "@crazytalk/ui";
import { Download, Upload } from "lucide-react";
import "./data-transfer-button.css";

type Props = Omit<ComponentProps<typeof Button>, "variant" | "children"> & {
  direction: "import" | "export";
  children?: ReactNode;
};

export default function DataTransferButton({
  direction,
  children,
  className = "",
  loading,
  ...props
}: Props) {
  const Icon = direction === "import" ? Download : Upload;
  return (
    <Button
      {...props}
      variant="ghost"
      loading={loading}
      className={`data-transfer-button ${className}`}
    >
      {!loading && <Icon size={16} aria-hidden="true" />}
      {children ?? (direction === "import" ? "导入数据" : "导出数据")}
    </Button>
  );
}
