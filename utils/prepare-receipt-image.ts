import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";
import { Platform } from "react-native";
import { prepareReceiptImage, type ReceiptImageSource } from "./receipt-image-core";

export async function prepareReceiptUpload(source: ReceiptImageSource): Promise<string> {
  return prepareReceiptImage(source, async (image, { resize, quality }) => {
    const context = ImageManipulator.manipulate(image.uri);
    let rendered: ImageRef | undefined;
    let temporaryUri: string | undefined;
    try {
      if (resize) context.resize(resize);
      rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
      temporaryUri = result.uri;
      return result.base64 ?? "";
    } finally {
      if (Platform.OS === "web") {
        if (temporaryUri?.startsWith("blob:")) URL.revokeObjectURL(temporaryUri);
        if (rendered && "uri" in rendered && typeof rendered.uri === "string"
          && rendered.uri.startsWith("blob:")) URL.revokeObjectURL(rendered.uri);
      }
      rendered?.release();
      context.release();
      // Only remove our generated cache copy; retain the user's original photo.
      if (Platform.OS !== "web" && temporaryUri && temporaryUri !== image.uri) {
        try { new File(temporaryUri).delete(); } catch { /* The OS also evicts cache files. */ }
      }
    }
  });
}
