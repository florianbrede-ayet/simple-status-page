"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage
} from "@/components/ui/form";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { useState } from "react";

const baseUrl = import.meta.env.VITE_API_BASE_URL;

const FormSchema = z.object({
	email: z
		.string()
		.min(3, {
			message: "Please enter your email."
		})
		.email("Please enter a valid email.")
});

export function SubscribeDialog() {
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			email: "mail@company.com"
		}
	});

	function onSubmit(data: z.infer<typeof FormSchema>) {
		console.log("submit", data);

		fetch(`${baseUrl}/api/subscribe`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(data)
		})
			.then((response) => {
				if (response.ok) {
					return response.json();
				}
				throw new Error("Network response was not ok");
			})
			.then(() => {
				toast({
					title: "Successfully submitted!",
					description: "Please check your inbox to confirm your subscription."
				});
				setIsDialogOpen(false);
			})
			.catch(() => {
				toast({
					variant: "destructive",
					title: "Error!",
					description: "There was a problem processing your request."
				});
			});
	}

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Subscribe</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Subscribe For Updates</DialogTitle>
					<DialogDescription>
						By subscribing you will be notified of important status updates, incidents, and
						scheduled maintenance.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)}>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<div className="grid gap-4 py-4">
										<div className="grid grid-cols-4 items-center gap-x-4 gap-y-1">
											<FormLabel className="text-right">Email</FormLabel>
											<FormControl>
												<Input placeholder="mail@company.com" className="col-span-3" {...field} />
											</FormControl>
											<div className="flex w-full col-span-1"></div>
											<div className="flex w-full col-span-3">
												<FormMessage />
											</div>
										</div>
									</div>
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit">Submit</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
