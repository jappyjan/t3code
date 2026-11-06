import type {
  ChatAttachment,
  EnvironmentId,
  OrchestrationMessageContext,
} from "@t3tools/contracts";

import { useAssetUrls } from "../../assets/assetUrls";
import { formatBytes } from "../../lib/formatBytes";
import { selectMessageImageResources } from "../../session-logic";
import { ContextChip, ContextChipLabel, type ContextChipKind } from "../ContextChip";
import { AttachmentImage } from "../media/AttachmentImage";

const RECORD_CHIP_KINDS: Partial<Record<string, ContextChipKind>> = {
  terminal: "terminal",
  "review-comment": "review-comment",
  "preview-annotation": "preview-annotation",
  thread: "thread",
  environment: "environment",
};

/** The images, files and context that came with a run's starting prompt. */
export function PipelineStartAttachments(props: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ChatAttachment>;
  readonly context: OrchestrationMessageContext | undefined;
}) {
  const images = props.attachments.filter((attachment) => attachment.type === "image");
  const files = props.attachments.filter((attachment) => attachment.type !== "image");
  const resources = selectMessageImageResources(images);
  const urls = useAssetUrls(props.environmentId, resources);
  const urlsById = new Map(
    resources.flatMap((resource, index) => {
      const url = urls[index];
      return url ? [[resource.attachmentId, url] as const] : [];
    }),
  );
  // Image and file records only bind the attachments shown above.
  const records = (props.context?.records ?? []).filter(
    (record) => record.kind !== "image" && record.kind !== "file",
  );
  if (images.length + files.length + records.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {images.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-xl bg-message">
              <AttachmentImage
                name={image.name}
                mimeType={image.mimeType}
                src={urlsById.get(image.id)}
                alt={image.name}
                decoding="async"
                loading="lazy"
                className="block h-24 w-auto min-w-16 max-w-48 transform-gpu object-cover"
              />
            </div>
          ))}
        </div>
      ) : null}
      {files.map((file) => (
        <ContextChip key={file.id} kind="file" shape="bubble">
          <ContextChipLabel>{file.name}</ContextChipLabel>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatBytes(file.sizeBytes)}
          </span>
        </ContextChip>
      ))}
      {records.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {records.map((record) => (
            <ContextChip
              key={record.contextId}
              kind={RECORD_CHIP_KINDS[record.kind] ?? "neutral"}
              shape="inline"
            >
              <ContextChipLabel>{record.label}</ContextChipLabel>
            </ContextChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
