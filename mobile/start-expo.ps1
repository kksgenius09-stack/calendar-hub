$mobileEnv = @{}
Get-Content -LiteralPath "..\.env.local" -Encoding utf8 | ForEach-Object {
  if ($_ -match '^(?<key>[^#=]+)=(?<value>.*)$') {
    $mobileEnv[$matches.key.Trim()] = $matches.value.Trim().Trim([char]34)
  }
}

$env:EXPO_PUBLIC_SUPABASE_URL = $mobileEnv['NEXT_PUBLIC_SUPABASE_URL']
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $mobileEnv['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
$env:EXPO_PUBLIC_API_URL = 'https://oncal-calendar-hub.racing-lemur-4380.chatgpt.site'

npx expo start --lan --clear --port 8082
