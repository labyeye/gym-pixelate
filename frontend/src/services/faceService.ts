import { request, API_BASE, getToken } from "./api";

export const faceService = {
  register: (memberId: string, imageBlob: Blob) => {
    const formData = new FormData();
    formData.append("memberId", memberId);
    formData.append("image", imageBlob, "face.jpg");
    return request<{ success: boolean; message: string }>("/face/register", {
      method: "POST",
      body: formData,
    });
  },
  verify: (imageBlob: Blob) => {
    const formData = new FormData();
    formData.append("image", imageBlob, "face.jpg");
    return request<{
      success: boolean;
      data?: any;
    }>("/face/verify", {
      method: "POST",
      body: formData,
    });
  },
};
