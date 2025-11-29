export interface Entity{
    id: number;
}

export interface Response<T> {
    success: boolean;
    data: T; 
    message?: string;
    paginationResult?: PaginationResult;
}


export interface PaginationRequest {
    pageNumber: number;
    pageSize: number;
}


export interface PaginationResult{totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  message?: string;
}
  