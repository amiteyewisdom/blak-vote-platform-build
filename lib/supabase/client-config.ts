import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export const MISSING_SUPABASE_ENV_MESSAGE =
  'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable authentication and database features.'

type CreateBrowserClientOptions = NonNullable<Parameters<typeof createBrowserClient>[2]>
type BrowserClientOptions = Omit<CreateBrowserClientOptions, 'cookies'>

export function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    return null
  }

  return { url, publishableKey }
}

function createMissingSupabaseError() {
  return Object.assign(new Error(MISSING_SUPABASE_ENV_MESSAGE), {
    code: 'SUPABASE_NOT_CONFIGURED',
    status: 503,
  })
}

function createMissingQueryBuilder() {
  const result = {
    data: null,
    error: createMissingSupabaseError(),
    count: null,
    status: 503,
    statusText: 'Supabase not configured',
  }

  const builder: any = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    gt: () => builder,
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    match: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    or: () => builder,
    ilike: () => builder,
    maybeSingle: async () => result,
    single: async () => result,
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: any) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally: any) => Promise.resolve(result).finally(onFinally),
  }

  return builder
}

function createMissingStorageBucket() {
  const errorResult = {
    data: null,
    error: createMissingSupabaseError(),
  }

  return {
    upload: async () => errorResult,
    list: async () => errorResult,
    remove: async () => errorResult,
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
  }
}

function createMissingBrowserClient() {
  const authError = createMissingSupabaseError()

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: authError }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: authError }),
      signUp: async () => ({ data: { user: null, session: null }, error: authError }),
      resetPasswordForEmail: async () => ({ data: null, error: authError }),
      updateUser: async () => ({ data: { user: null }, error: authError }),
      signOut: async () => ({ error: authError }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe() {},
          },
        },
      }),
    },
    from: () => createMissingQueryBuilder(),
    rpc: async () => ({ data: null, error: authError }),
    storage: {
      from: () => createMissingStorageBucket(),
    },
  } as unknown as SupabaseClient
}

export function createOptionalBrowserClient(options?: BrowserClientOptions) {
  const config = getSupabaseBrowserConfig()

  if (!config) {
    return createMissingBrowserClient()
  }

  return createBrowserClient(config.url, config.publishableKey, options as CreateBrowserClientOptions)
}