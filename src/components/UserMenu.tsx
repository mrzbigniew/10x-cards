import { useRef } from "react";
import { User, Settings, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function UserMenu() {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} method="POST" action="/api/auth/signout" className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Menu użytkownika"
            className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            <Avatar>
              <AvatarFallback>
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href="/settings" className="flex items-center gap-2">
              <Settings className="size-4" />
              Ustawienia
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => formRef.current?.requestSubmit()}
          >
            <LogOut className="size-4" />
            Wyloguj
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
