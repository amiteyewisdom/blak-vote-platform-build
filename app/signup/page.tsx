"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from '@/hooks/use-toast'

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const role = "voter";
  const { toast } = useToast()

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "voter"
        }
      }
    });

    if (error) {
      toast({ title: 'Signup failed', description: error.message, variant: 'destructive' })
      return;
    }

    toast({ title: 'Account created', description: 'Account created successfully' })
  };

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto mt-20">
      <h1 className="text-2xl font-bold">Sign Up</h1>

      <input
        className="border p-2"
        type="email"
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        className="border p-2"
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="bg-black text-white p-2"
        onClick={handleSignup}
      >
        Create Account
      </button>
    </div>
  );
}
