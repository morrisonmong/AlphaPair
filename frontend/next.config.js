/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  
  async rewrites() {
    return [
      {
        // 處理所有API路由
        source: '/api/:path*',
        destination: 'http://api:8000/:path*'  // 在容器內部訪問 API
      },
      {
        // 處理沒有/api前綴的資產快照路由
        source: '/asset-snapshots',
        destination: 'http://api:8000/asset-snapshots'
      },
      {
        // 處理沒有/api前綴的資產快照創建路由
        source: '/asset-snapshots/create',
        destination: 'http://api:8000/asset-snapshots/create'
      },
      {
        // 處理測試連接路由
        source: '/api/test-connection/:provider',
        destination: 'http://api:8000/test-connection/:provider'
      }
    ];
  },
};

module.exports = nextConfig; 