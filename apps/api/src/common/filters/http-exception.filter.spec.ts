import { HttpException, HttpStatus, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = { url: '/test' };
    mockHost = {
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should return structured error for BadRequestException', () => {
    filter.catch(new BadRequestException('Invalid input'), mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        message: 'Invalid input',
      }),
    );
  });

  it('should return structured error for NotFoundException', () => {
    filter.catch(new NotFoundException('Not found'), mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(404);
  });

  it('should return structured error for ForbiddenException', () => {
    filter.catch(new ForbiddenException('Forbidden'), mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(403);
  });

  it('should never include stack traces in response', () => {
    filter.catch(new BadRequestException('test'), mockHost as any);
    const response = mockResponse.json.mock.calls[0][0];
    expect(response.stack).toBeUndefined();
  });

  it('should return generic message for 500 errors in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    filter.catch(new HttpException('Secret details', 500), mockHost as any);
    const response = mockResponse.json.mock.calls[0][0];
    expect(response.message).toBe('Internal server error');
    process.env.NODE_ENV = origEnv;
  });

  it('should handle non-HttpException errors', () => {
    filter.catch(new Error('Unknown crash'), mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        message: 'An unexpected error occurred',
      }),
    );
  });

  it('should skip HTTP handling for WebSocket context', () => {
    mockHost.getType.mockReturnValue('ws');
    filter.catch(new Error('WS error'), mockHost as any);
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should include timestamp and path', () => {
    filter.catch(new BadRequestException('test'), mockHost as any);
    const response = mockResponse.json.mock.calls[0][0];
    expect(response.timestamp).toBeDefined();
    expect(response.path).toBe('/test');
  });
});
