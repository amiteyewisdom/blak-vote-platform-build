'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Search, Shield } from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
  first_name?: string
  last_name?: string
  created_at: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setUsers(data)
      setFilteredUsers(data)
    }

    setLoading(false)
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)

    const filtered = users.filter((user) =>
      user.email.toLowerCase().includes(term.toLowerCase()) ||
      user.first_name?.toLowerCase().includes(term.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(term.toLowerCase())
    )

    setFilteredUsers(filtered)
  }

  const updateRole = async (id: string, newRole: string) => {
    await supabase.from('users').update({ role: newRole }).eq('id', id)
    fetchUsers()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0B0F]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-10 p-8 text-white">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-neutral-400">
          Manage platform users and roles.
        </p>
      </div>

      <div className="card-premium p-6 space-y-6">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-[#181822] border border-white/10 p-3 pl-10 rounded-2xl focus:ring-2 focus:ring-[#F5C044] outline-none"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-400 border-b border-white/10">
              <tr>
                <th className="text-left py-4">User</th>
                <th className="text-left py-4">Email</th>
                <th className="text-left py-4">Role</th>
                <th className="text-left py-4">Joined</th>
                <th className="text-right py-4">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-white/5 hover:bg-white/5 transition"
                >
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black flex items-center justify-center font-bold">
                        {user.first_name?.[0] ||
                          user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">
                          {user.first_name
                            ? `${user.first_name} ${user.last_name || ''}`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 text-neutral-400">
                    {user.email}
                  </td>

                  <td className="py-4">
                    <span
                      className={`px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                        user.role === 'admin'
                          ? 'bg-[#F5C044] text-black'
                          : user.role === 'organizer'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-neutral-800 text-neutral-400 border border-white/10'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>

                  <td className="py-4 text-neutral-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>

                  <td className="py-4 text-right">
                    <select
                      value={user.role}
                      onChange={(e) =>
                        updateRole(user.id, e.target.value)
                      }
                      className="bg-[#181822] border border-white/10 p-2 rounded-xl text-sm"
                    >
                      <option value="user">User</option>
                      <option value="organizer">Organizer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
