export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type DeleteStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CommunityPrivacy = "PUBLIC" | "PRIVATE";

