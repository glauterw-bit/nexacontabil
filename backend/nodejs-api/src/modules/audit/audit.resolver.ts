import { Resolver, Query, Args } from '@nestjs/graphql';
import { ObjectType, Field } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { AuditService } from './audit.service';

@ObjectType()
export class AuditTrailType {
  @Field() id: string;
  @Field() companyId: string;
  @Field() action: string;
  @Field() entityType: string;
  @Field() entityId: string;
  @Field() performedBy: string;
  @Field({ nullable: true }) agentType?: string;
  @Field(() => GraphQLJSON, { nullable: true }) oldValues?: any;
  @Field(() => GraphQLJSON, { nullable: true }) newValues?: any;
  @Field(() => GraphQLJSON, { nullable: true }) metadata?: any;
  @Field() previousHash: string;
  @Field() currentHash: string;
  @Field() createdAt: Date;
}

@ObjectType()
export class IntegrityCheckType {
  @Field() valid: boolean;
  @Field(() => [String]) invalidEntries: string[];
}

@Resolver()
export class AuditResolver {
  constructor(private readonly auditService: AuditService) {}

  @Query(() => [AuditTrailType])
  async auditTrail(
    @Args('companyId') companyId: string,
    @Args('entityType', { nullable: true }) entityType?: string,
  ) {
    return this.auditService.getTrail(companyId, { entityType });
  }

  @Query(() => IntegrityCheckType)
  async verifyAuditIntegrity(@Args('companyId') companyId: string) {
    return this.auditService.verifyIntegrity(companyId);
  }
}
