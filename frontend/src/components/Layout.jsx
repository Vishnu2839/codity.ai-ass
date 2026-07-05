import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  FolderOpen,
  ListOrdered,
  Briefcase,
  Server,
  RefreshCw,
  Skull,
  FileText,
  Settings,
  LogOut,
  Bell,
  Search,
  Menu,
} from 'lucide-react';

const SIDEBAR_LINKS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Organizations', path: '/organizations', icon: Building2 },
  { name: 'Projects', path: '/projects', icon: FolderOpen },
  { name: 'Queues', path: '/queues', icon: ListOrdered },
  { name: 'Jobs', path: '/jobs', icon: Briefcase },
  { name: 'Workers', path: '/workers', icon: Server },
  { name: 'Retry Queue', path: '/retry-queue', icon: RefreshCw },
  { name: 'Dead Letter Queue', path: '/dlq', icon: Skull },
  { name: 'Execution Logs', path: '/logs', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-950 flex font-sans text-gray-200">
      {/* Sidebar */}
      <aside
        className={`bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-3">
            D
          </div>
          <span className="font-bold text-lg text-white tracking-tight whitespace-nowrap">DJS Enterprise</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {SIDEBAR_LINKS.map((link) => {
            const active = location.pathname === link.path;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-900/50 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-blue-400' : 'text-gray-500'}`} />
                {link.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/30 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-gray-400 hover:bg-gray-800 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden md:flex items-center text-sm">
              <span className="text-gray-500">System</span>
              <span className="mx-2 text-gray-700">/</span>
              <span className="font-medium text-gray-300">Dashboard</span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Org:
              </span>
              <select className="text-sm bg-transparent font-medium text-gray-300 focus:outline-none cursor-pointer [&>option]:bg-gray-900">
                <option>codity.ai</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Project:
              </span>
              <select className="text-sm bg-transparent font-medium text-gray-300 focus:outline-none cursor-pointer [&>option]:bg-gray-900">
                <option>DJS</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Global search..."
                className="pl-9 pr-4 py-1.5 text-sm border border-gray-700 rounded-full w-64 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all bg-gray-950 text-gray-300"
              />
            </div>

            <button className="relative p-1.5 text-gray-400 hover:bg-gray-800 rounded-full">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-gray-900"></span>
            </button>

            {user && (
              <div className="flex items-center gap-3 pl-4 border-l border-gray-800">
                <div className="w-8 h-8 bg-blue-900/50 text-blue-400 rounded-full flex items-center justify-center font-semibold text-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-sm">
                  <div className="font-medium text-gray-200">{user.name}</div>
                  <div className="text-gray-500 text-xs">{user.email}</div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
