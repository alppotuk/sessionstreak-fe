export interface Entity{
    id: number;
}

export interface Response<T> {
    success: boolean;
    data: T; 
    message?: string;
}


export interface PaginationRequest {
    pageNumber: number;
    pageSize: number;
  }
  
  export interface PaginationResponse<T> {
    data: T[];
    totalCount: number;
    page: number;
    pageSize: number;
  }
  