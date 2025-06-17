import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("React Error Boundary caught an error:", error);
    // eslint-disable-next-line no-console
    console.error("Error Info:", errorInfo);
    // eslint-disable-next-line no-console
    console.error("Component Stack:", errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", backgroundColor: "#ffe6e6", border: "1px solid #ff0000", margin: "10px" }}>
          <h2 style={{ color: "#d00", marginTop: 0 }}>⚠️ 渲染错误</h2>
          <details style={{ whiteSpace: "pre-wrap", marginBottom: "10px" }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
              点击查看错误详情
            </summary>
            <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
              <h3>错误信息:</h3>
              <pre style={{ color: "#d00", fontSize: "14px" }}>
                {this.state.error?.toString()}
              </pre>
              
              <h3>错误堆栈:</h3>
              <pre style={{ fontSize: "12px", overflow: "auto" }}>
                {this.state.error?.stack}
              </pre>
              
              <h3>组件堆栈:</h3>
              <pre style={{ fontSize: "12px", overflow: "auto" }}>
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
          </details>
          
          <button 
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{ 
              padding: "8px 16px", 
              backgroundColor: "#007bff", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "10px"
            }}
          >
            重试
          </button>
          
          <button 
            onClick={() => window.location.reload()}
            style={{ 
              padding: "8px 16px", 
              backgroundColor: "#6c757d", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
} 